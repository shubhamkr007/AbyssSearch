import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SearchBodyDto {
  // Empty string is allowed: browse all docs for the tenant.
  @IsString()
  @MaxLength(512)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;

  // { "tags": ["finance"], "metadata": { "year": 2026 } }
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sort?: string;
}

export class AnswerBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}

export class AnalyticsEventDto {
  @IsString()
  @MaxLength(32)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  docId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rank?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  resultCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @IsOptional()
  @IsBoolean()
  zeroResult?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;
}

export class EventsBodyDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  events!: AnalyticsEventDto[];
}

export class SuggestQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  size?: number;
}
