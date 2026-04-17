import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from '../Jwt/jwt.strategy';
import { JwtAuthGuard } from '../Jwt/jwtauth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { getRequiredEnv } from '../config/env';
import { AdminJwtStrategy } from './admin-jwt.strategy';
import { AdminJwtAuthGuard } from './admin-jwt.guard';

const jwtSecret = getRequiredEnv('JWT_SECRET');

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, AdminJwtStrategy, AdminJwtAuthGuard],
  // Export JwtAuthGuard so other modules (policy, claims) can import it directly
  exports: [JwtAuthGuard, AdminJwtAuthGuard, JwtModule],
})
export class AuthModule {}
