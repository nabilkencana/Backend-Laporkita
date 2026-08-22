import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationType, ReportStatus, Prisma } from '@prisma/client';

describe('NotificationsService & RouteAlert', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const userId = 'user-1';
  const otherUserId = 'user-2';
  const notificationId = 'notif-1';

  const mockSubscription = {
    id: 'sub-1',
    user_id: userId,
    device_token: 'fcm_token_12345',
    last_lat: new Prisma.Decimal(-7.983908),
    last_long: new Prisma.Decimal(112.621391),
    updated_at: new Date(),
  };

  const mockReport = {
    id: 'rep-1',
    report_code: '#LP-2026-000001',
    status: ReportStatus.verified,
    latitude: new Prisma.Decimal(-7.98395), // ~10m from user
    longitude: new Prisma.Decimal(112.6214),
    category: { name: 'Jalan Berlubang' },
  };

  const mockNotification = {
    id: notificationId,
    user_id: userId,
    type: NotificationType.route_alert,
    title: 'Peringatan Rute',
    body: 'Kerusakan jalan di depan Anda',
    is_read: false,
    created_at: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      routeAlertSubscription: {
        upsert: jest.fn().mockResolvedValue(mockSubscription),
        delete: jest.fn().mockResolvedValue(mockSubscription),
        findMany: jest.fn().mockResolvedValue([mockSubscription]),
      },
      report: {
        findMany: jest.fn().mockResolvedValue([mockReport]),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null), // Not previously alerted
        create: jest.fn().mockResolvedValue(mockNotification),
        findMany: jest.fn().mockResolvedValue([mockNotification]),
        findUnique: jest.fn().mockResolvedValue(mockNotification),
        update: jest.fn().mockResolvedValue({ ...mockNotification, is_read: true }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Route Alert Subscriptions', () => {
    it('should upsert subscription with device token and coordinates', async () => {
      const upsertSpy = jest.spyOn(prisma.routeAlertSubscription, 'upsert');

      const result = await service.subscribeRouteAlert(userId, {
        device_token: 'fcm_token_12345',
        last_lat: -7.983908,
        last_long: 112.621391,
      });

      expect(result.device_token).toBe('fcm_token_12345');
      expect(upsertSpy).toHaveBeenCalled();
    });

    it('should delete subscription on unsubscribe', async () => {
      const deleteSpy = jest.spyOn(prisma.routeAlertSubscription, 'delete');

      const result = await service.unsubscribeRouteAlert(userId);

      expect(result.message).toContain('berhasil dibatalkan');
      expect(deleteSpy).toHaveBeenCalledWith({
        where: { user_id: userId },
      });
    });
  });

  describe('checkProximityAndTriggerAlerts (Geofencing simulation)', () => {
    it('should detect nearby report within 500m and trigger route_alert notification', async () => {
      const createSpy = jest.spyOn(prisma.notification, 'create');

      const result = await service.checkProximityAndTriggerAlerts(userId);

      expect(result.checkedSubscribers).toBe(1);
      expect(result.alertsTriggered).toBe(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
      const callArgs = createSpy.mock.calls[0] as unknown as [
        { data: { user_id: string; type: NotificationType; reference_report_id: string } },
      ];
      expect(callArgs[0].data.user_id).toBe(userId);
      expect(callArgs[0].data.type).toBe(NotificationType.route_alert);
      expect(callArgs[0].data.reference_report_id).toBe('rep-1');
    });

    it('should not duplicate alert if already notified recently', async () => {
      jest.spyOn(prisma.notification, 'findFirst').mockResolvedValue(mockNotification);
      const createSpy = jest.spyOn(prisma.notification, 'create');

      const result = await service.checkProximityAndTriggerAlerts(userId);

      expect(result.alertsTriggered).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('In-App Notifications', () => {
    it('should return paginated user notifications', async () => {
      const result = await service.getUserNotifications(userId, 10);

      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.unreadCount).toBe(1);
    });

    it('should mark single notification as read for the owner', async () => {
      const updateSpy = jest.spyOn(prisma.notification, 'update');

      const result = await service.markAsRead(notificationId, userId);

      expect(result.is_read).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { is_read: true },
      });
    });

    it('should throw ForbiddenException if user tries to mark other user notification as read', async () => {
      await expect(service.markAsRead(notificationId, otherUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if notification does not exist', async () => {
      jest.spyOn(prisma.notification, 'findUnique').mockResolvedValue(null);

      await expect(service.markAsRead('non-existent', userId)).rejects.toThrow(NotFoundException);
    });

    it('should mark all notifications as read for current user', async () => {
      const updateManySpy = jest.spyOn(prisma.notification, 'updateMany');

      const result = await service.markAllAsRead(userId);

      expect(result.updatedCount).toBe(2);
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { user_id: userId, is_read: false },
        data: { is_read: true },
      });
    });
  });
});
