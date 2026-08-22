import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { RouteAlertController } from './route-alert.controller.js';

@Module({
  controllers: [NotificationsController, RouteAlertController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
