import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { actorFrom, AdminGuard } from '../common/admin.guard';
import { MetricsService } from '../metrics/metrics.service';
import {
  CreateSourceDto,
  CreateTenantDto,
  IssueKeyDto,
  SetTabsDto,
  UpsertSearchConfigDto,
  VerifyKeyDto,
} from './dto';
import { TenantsService } from './tenants.service';

@Controller()
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  // ---- internal reads ----------------------------------------------------

  @Get('tenants/:id')
  async getTenant(@Param('id') id: string) {
    this.metrics?.configReads.inc({ endpoint: 'tenant' });
    return this.tenants.getTenant(id);
  }

  @Post('keys/verify')
  @HttpCode(200)
  async verifyKey(@Body() dto: VerifyKeyDto) {
    try {
      const context = await this.tenants.verifyKey(dto.key);
      this.metrics?.keyVerify.inc({ result: 'success' });
      return context;
    } catch (err) {
      this.metrics?.keyVerify.inc({ result: 'failure' });
      throw err;
    }
  }

  @Get('tenants/:id/config')
  async getConfig(@Param('id') id: string) {
    this.metrics?.configReads.inc({ endpoint: 'config' });
    return this.tenants.getConfig(id);
  }

  @Get('tenants/:id/search-config')
  async getSearchConfig(@Param('id') id: string) {
    this.metrics?.configReads.inc({ endpoint: 'search-config' });
    return this.tenants.getSearchConfig(id);
  }

  @Get('tenants/:id/sources')
  async getSources(@Param('id') id: string) {
    this.metrics?.configReads.inc({ endpoint: 'sources' });
    return this.tenants.getSources(id);
  }

  // ---- admin writes ------------------------------------------------------

  @Post('tenants')
  @UseGuards(AdminGuard)
  async createTenant(@Body() dto: CreateTenantDto, @Req() req: Request) {
    this.metrics?.adminWrites.inc({ action: 'tenant.create' });
    return this.tenants.createTenant(dto, actorFrom(req));
  }

  @Post('tenants/:id/keys')
  @UseGuards(AdminGuard)
  async issueKey(
    @Param('id') id: string,
    @Body() dto: IssueKeyDto,
    @Req() req: Request,
  ) {
    this.metrics?.adminWrites.inc({ action: 'key.issue' });
    return this.tenants.issueKey(id, dto, actorFrom(req));
  }

  @Delete('tenants/:id/keys/:keyId')
  @UseGuards(AdminGuard)
  async revokeKey(
    @Param('id') id: string,
    @Param('keyId') keyId: string,
    @Req() req: Request,
  ) {
    this.metrics?.adminWrites.inc({ action: 'key.revoke' });
    return this.tenants.revokeKey(id, keyId, actorFrom(req));
  }

  @Put('tenants/:id/tabs')
  @UseGuards(AdminGuard)
  async setTabs(
    @Param('id') id: string,
    @Body() dto: SetTabsDto,
    @Req() req: Request,
  ) {
    this.metrics?.adminWrites.inc({ action: 'tabs.update' });
    return this.tenants.setTabs(id, dto.tabs, actorFrom(req));
  }

  @Put('tenants/:id/search-config')
  @UseGuards(AdminGuard)
  async upsertSearchConfig(
    @Param('id') id: string,
    @Body() dto: UpsertSearchConfigDto,
    @Req() req: Request,
  ) {
    this.metrics?.adminWrites.inc({ action: 'search-config.update' });
    return this.tenants.upsertSearchConfig(id, dto, actorFrom(req));
  }

  @Post('tenants/:id/sources')
  @UseGuards(AdminGuard)
  async createSource(
    @Param('id') id: string,
    @Body() dto: CreateSourceDto,
    @Req() req: Request,
  ) {
    this.metrics?.adminWrites.inc({ action: 'source.create' });
    return this.tenants.createSource(id, dto, actorFrom(req));
  }
}
