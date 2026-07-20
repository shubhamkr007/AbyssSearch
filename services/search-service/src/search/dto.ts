import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchDto {
  // Tenant prefix - used for index/alias resolution and the tenant_id filter.
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tenant!: string;

  // Optional distinct tenant_id filter value (defaults to `tenant`).
  @IsOptional()
  @IsString()
  tenantId?: string;

  // Empty string is allowed: browse all tenant docs (match_all + tenant filter).
  @IsString()
  @MaxLength(512)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;

  // { field: [values] }, e.g. { "tags": ["billing"], "source": ["news"] }
  @IsOptional()
  @IsObject()
  filters?: Record<string, string[]>;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];
}

export class SuggestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tenant!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

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

export class DidYouMeanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tenant!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tab?: string;
}
