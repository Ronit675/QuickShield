import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PremiumModule } from '../premium/premium.module';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';

@Module({
  imports: [AuthModule, PremiumModule],
  controllers: [PolicyController],
  providers: [PolicyService],
})
export class PolicyModule {}
