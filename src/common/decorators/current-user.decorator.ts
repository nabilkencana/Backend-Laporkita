import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  phone_number: string | null;
  role: UserRole;
  agency_id: string | null;
  full_name: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
