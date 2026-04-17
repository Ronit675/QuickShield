import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminSendOtpDto } from './admin-send-otp.dto';
import { AdminVerifyOtpDto } from './admin-verify-otp.dto';
import { AdminJwtAuthGuard } from './admin-jwt.guard';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-otp')
  requestOtp(@Body() dto: AdminSendOtpDto) {
    return this.authService.sendAdminOtp(dto.phone);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: AdminVerifyOtpDto) {
    return this.authService.verifyAdminOtp(dto.phone, dto.otpCode ?? dto.otp ?? '');
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  getMe(@Request() req: any) {
    return this.authService.getAdminMe(req.user.adminId);
  }
}
