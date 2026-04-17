import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminClaimsService } from './admin-claims.service';

@Controller('admin/claims')
@UseGuards(AdminJwtAuthGuard)
export class AdminClaimsController {
  constructor(private readonly adminClaimsService: AdminClaimsService) {}

  @Get()
  getClaims(@Request() req: any) {
    return this.adminClaimsService.listClaims(req.user.adminId);
  }

  @Get(':id')
  getClaim(@Request() req: any, @Param('id') claimId: string) {
    return this.adminClaimsService.getClaim(req.user.adminId, claimId);
  }

  @Patch(':id/status')
  updateClaimStatus(@Request() req: any, @Param('id') claimId: string, @Body('status') status: string) {
    return this.adminClaimsService.updateClaimStatus(req.user.adminId, claimId, status);
  }

  @Post(':id/notes')
  addClaimNote(@Request() req: any, @Param('id') claimId: string, @Body('note') note: string) {
    return this.adminClaimsService.addClaimNote(req.user.adminId, claimId, note);
  }
}
