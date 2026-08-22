import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RouteAlertSubscribeDto } from './dto/route-alert-subscribe.dto.js';
import { calculateHaversineDistanceMeters } from '../reports/utils/geo.util.js';
import { NotificationType, Prisma, ReportStatus } from '@prisma/client';

export const ROUTE_ALERT_RADIUS_METERS = 500; // Radius deteksi peringatan rute

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── 1. Route Alert Subscriptions (ERD §2.14 & PRD §6.3) ───────────────────

  /**
   * Mendaftarkan / memperbarui token FCM dan koordinat terakhir user untuk Route Alert
   */
  async subscribeRouteAlert(userId: string, dto: RouteAlertSubscribeDto) {
    return this.prisma.routeAlertSubscription.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        device_token: dto.device_token,
        last_lat: dto.last_lat !== undefined ? new Prisma.Decimal(dto.last_lat) : null,
        last_long: dto.last_long !== undefined ? new Prisma.Decimal(dto.last_long) : null,
      },
      update: {
        device_token: dto.device_token,
        ...(dto.last_lat !== undefined ? { last_lat: new Prisma.Decimal(dto.last_lat) } : {}),
        ...(dto.last_long !== undefined ? { last_long: new Prisma.Decimal(dto.last_long) } : {}),
      },
    });
  }

  /**
   * Menghapus langganan route alert user
   */
  async unsubscribeRouteAlert(userId: string) {
    try {
      await this.prisma.routeAlertSubscription.delete({
        where: { user_id: userId },
      });
      return { message: 'Langganan Route Alert berhasil dibatalkan.' };
    } catch {
      return { message: 'User belum terdaftar pada Route Alert.' };
    }
  }

  /**
   * Cek proximity geografis antara lokasi user dan titik kerusakan terverifikasi.
   * Mengirim notifikasi kontekstual jika berada dalam radius ROUTE_ALERT_RADIUS_METERS.
   */
  async checkProximityAndTriggerAlerts(specificUserId?: string): Promise<{
    checkedSubscribers: number;
    alertsTriggered: number;
  }> {
    const subscriptions = await this.prisma.routeAlertSubscription.findMany({
      where: {
        ...(specificUserId ? { user_id: specificUserId } : {}),
        last_lat: { not: null },
        last_long: { not: null },
      },
    });

    if (subscriptions.length === 0) {
      return { checkedSubscribers: 0, alertsTriggered: 0 };
    }

    // Ambil seluruh laporan aktif (verified / assigned / in_progress)
    const activeReports = await this.prisma.report.findMany({
      where: {
        status: {
          in: [ReportStatus.verified, ReportStatus.assigned, ReportStatus.in_progress],
        },
      },
      include: {
        category: { select: { name: true } },
      },
    });

    let alertsTriggered = 0;

    for (const sub of subscriptions) {
      if (!sub.last_lat || !sub.last_long) continue;

      const userLat = Number(sub.last_lat);
      const userLng = Number(sub.last_long);

      // Cari laporan terdekat dalam radius
      for (const report of activeReports) {
        const reportLat = Number(report.latitude);
        const reportLng = Number(report.longitude);

        const distanceM = calculateHaversineDistanceMeters(userLat, userLng, reportLat, reportLng);

        if (distanceM <= ROUTE_ALERT_RADIUS_METERS) {
          // Cek apakah sudah pernah kirim notifikasi serupa dalam 6 jam terakhir agar tidak spam
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
          const existingNotif = await this.prisma.notification.findFirst({
            where: {
              user_id: sub.user_id,
              type: NotificationType.route_alert,
              reference_report_id: report.id,
              created_at: { gte: sixHoursAgo },
            },
          });

          if (!existingNotif) {
            await this.prisma.notification.create({
              data: {
                user_id: sub.user_id,
                type: NotificationType.route_alert,
                title: '⚠️ Peringatan Rute: Fasilitas Rusak di Sekitar Anda',
                body: `Perhatian: Terdapat laporan ${report.category.name} (${report.report_code}) berjarak ~${Math.round(
                  distanceM,
                )} meter di depan Anda. Harap berhati-hati saat melintas.`,
                reference_report_id: report.id,
              },
            });

            // TODO: Integrasi eksternal FCM Push Notification untuk push notif ke background mobile warga
            this.logger.log(
              `[Route Alert] Mengirim notifikasi ke user ${sub.user_id} untuk laporan ${report.report_code} (~${Math.round(
                distanceM,
              )}m)`,
            );
            alertsTriggered++;
          }
        }
      }
    }

    return {
      checkedSubscribers: subscriptions.length,
      alertsTriggered,
    };
  }

  /**
   * Cron Job: Pengecekan berkala Route Alert setiap 15 menit
   */
  @Cron('*/15 * * * *')
  async handlePeriodicRouteAlertCron(): Promise<void> {
    this.logger.log('Menjalankan cron periodic Route Alert geofencing check...');
    await this.checkProximityAndTriggerAlerts();
  }

  // ── 2. In-App Notifications Management (ERD §2.15) ─────────────────────────

  async getUserNotifications(userId: string, limit = 20, cursor?: string) {
    const where = { user_id: userId };
    const total = await this.prisma.notification.count({ where });

    const notifications = await this.prisma.notification.findMany({
      where,
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { created_at: 'desc' },
      include: {
        reference_report: {
          select: {
            id: true,
            report_code: true,
            status: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (notifications.length > limit) {
      const nextItem = notifications.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    const unreadCount = await this.prisma.notification.count({
      where: { user_id: userId, is_read: false },
    });

    return {
      data: notifications,
      meta: {
        total,
        unreadCount,
        limit,
        nextCursor,
        hasPrevious: !!cursor,
      },
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      throw new NotFoundException(`Notifikasi dengan ID '${notificationId}' tidak ditemukan.`);
    }

    if (notif.user_id !== userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke notifikasi ini.');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { is_read: true },
    });
  }

  async markAllAsRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });

    return {
      message: 'Seluruh notifikasi berhasil ditandai telah dibaca.',
      updatedCount: res.count,
    };
  }
}
