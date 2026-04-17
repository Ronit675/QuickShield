import { Controller, Post, Put, Body, Get, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from '../Google/googleauth.dto';
import { JwtAuthGuard } from '../Jwt/jwtauth.guard';
import { SendPhoneOtpDto } from './send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './verify-phone-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/google  — called by the React Native app after Google sign-in
  @Post('google')
  googleSignIn(@Body() dto: GoogleAuthDto) {
    return this.authService.googleSignIn(dto.idToken);
  }

  @Post('phone/send-otp')
  sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
    return this.authService.sendPhoneOtp(dto.phone);
  }

  @Post('phone/verify-otp')
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.authService.verifyPhoneOtp(dto.phone, dto.otp);
  }

  // GET /auth/me  — used by the app on startup to restore session
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.userId);
  }

  @Get('app-state')
  @UseGuards(JwtAuthGuard)
  getAppState(@Request() req: any) {
    return this.authService.getAppState(req.user.userId);
  }

  @Put('app-state')
  @UseGuards(JwtAuthGuard)
  updateAppState(@Request() req: any, @Body() body: any) {
    return this.authService.updateAppState(req.user.userId, body);
  }

  @Post('app-state/suspicious-query')
  @UseGuards(JwtAuthGuard)
  raiseSuspiciousQuery(@Request() req: any) {
    return this.authService.raiseSuspiciousQuery(req.user.userId);
  }
}
