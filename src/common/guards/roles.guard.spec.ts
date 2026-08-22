import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator.js';

describe('RolesGuard (RBAC)', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  const createMockExecutionContext = (user?: Partial<AuthenticatedUser>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no @Roles() metadata is defined on the route', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockExecutionContext({ role: UserRole.citizen });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin, UserRole.operator]);
    const context = createMockExecutionContext({
      id: '1',
      role: UserRole.admin,
      full_name: 'Admin',
      email: 'admin@test.com',
      phone_number: null,
      agency_id: null,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user does not have any of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
    const context = createMockExecutionContext({
      id: '2',
      role: UserRole.citizen,
      full_name: 'Warga',
      email: 'warga@test.com',
      phone_number: null,
      agency_id: null,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user is unauthenticated or missing role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.operator]);
    const context = createMockExecutionContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
