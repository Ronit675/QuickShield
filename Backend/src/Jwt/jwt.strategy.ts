// jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getRequiredEnv } from '../config/env';

const jwtSecret = getRequiredEnv('JWT_SECRET');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: string; email: string; subjectType?: string }) {
    if (payload.subjectType === 'admin') {
      throw new UnauthorizedException('Invalid rider token');
    }

    // Returned value is attached to req.user in every guarded route
    return { userId: payload.sub, email: payload.email };
  }
}
