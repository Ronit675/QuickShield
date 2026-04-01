import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PolicyModule } from './policy/policy.module';
import { ProfileModule } from './profile/profile.module';
import { PremiumModule } from './premium/premium.module';

@Module({
  imports: [AuthModule, ProfileModule, PremiumModule, PolicyModule],
})
export class AppModule {}
