import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminZonesService } from './admin-zones.service';

@Controller('admin/zones')
@UseGuards(AdminJwtAuthGuard)
export class AdminZonesController {
  constructor(private readonly adminZonesService: AdminZonesService) {}

  @Get()
  getZones(@Request() req: any) {
    return this.adminZonesService.listZones(req.user.adminId);
  }

  @Get(':code')
  getZone(@Request() req: any, @Param('code') code: string) {
    return this.adminZonesService.getZone(req.user.adminId, code);
  }

  @Get(':code/disruptions')
  getZoneDisruptions(@Request() req: any, @Param('code') code: string) {
    return this.adminZonesService.getZoneDisruptions(req.user.adminId, code);
  }

  @Get(':code/claims')
  getZoneClaims(@Request() req: any, @Param('code') code: string) {
    return this.adminZonesService.getZoneClaims(req.user.adminId, code);
  }
}
