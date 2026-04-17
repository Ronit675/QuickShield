import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getRequiredEnv } from '../config/env';

const jwtSecret = getRequiredEnv('JWT_SECRET');

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: {
    sub: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    subjectType?: string;
  }) {
    if (payload.subjectType !== 'admin') {
      throw new UnauthorizedException('Invalid admin token');
    }

    return {
      adminId: payload.sub,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      role: payload.role ?? null,
    };
  }
}
