import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CorrelationId, RequireScopes, Tenant } from '../auth/scopes.decorator';
import type { TenantContext } from '../domain/types';
import { RateLimitGuard } from '../ratelimit/rate-limit.guard';
import { AnswerBodyDto, SearchBodyDto, SuggestQueryDto } from './dto';
import { GatewayService } from './gateway.service';

@Controller('v1')
@UseGuards(AuthGuard, RateLimitGuard)
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Get('config')
  config(@Tenant() ctx: TenantContext, @CorrelationId() cid?: string) {
    return this.gateway.doConfig(ctx, cid);
  }

  @Post('search')
  @HttpCode(200)
  @RequireScopes('search')
  search(
    @Tenant() ctx: TenantContext,
    @Body() dto: SearchBodyDto,
    @CorrelationId() cid?: string,
  ) {
    return this.gateway.doSearch(ctx, dto, cid);
  }

  @Get('suggest')
  @RequireScopes('search')
  suggest(
    @Tenant() ctx: TenantContext,
    @Query() dto: SuggestQueryDto,
    @CorrelationId() cid?: string,
  ) {
    return this.gateway.doSuggest(ctx, dto, cid);
  }

  @Get('autocomplete')
  @RequireScopes('search')
  autocomplete(
    @Tenant() ctx: TenantContext,
    @Query() dto: SuggestQueryDto,
    @CorrelationId() cid?: string,
  ) {
    return this.gateway.doAutocomplete(ctx, dto, cid);
  }

  @Post('answers')
  @HttpCode(200)
  @RequireScopes('rag')
  answers(
    @Tenant() ctx: TenantContext,
    @Body() dto: AnswerBodyDto,
    @CorrelationId() cid?: string,
  ) {
    return this.gateway.doAnswer(ctx, dto, cid);
  }
}
