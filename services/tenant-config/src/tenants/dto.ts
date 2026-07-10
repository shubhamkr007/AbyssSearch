import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  // Immutable after creation; used verbatim in Elasticsearch index names.
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, {
    message:
      'prefix must be 3-40 chars, lowercase alphanumeric and hyphens, not starting/ending with a hyphen',
  })
  prefix!: string;
}

export class VerifyKeyDto {
  @IsString()
  @MinLength(8)
  key!: string;
}

export class IssueKeyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  originAllowlist?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  rateLimit?: number;
}

export class CreateSourceDto {
  @IsString()
  @Matches(/^(document|news|image|rest|db|folder)$/, {
    message: 'type must be one of document|news|image|rest|db|folder',
  })
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsObject()
  connectorConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  schedule?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TabDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  tabKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsObject()
  sourceFilter?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SetTabsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TabDto)
  tabs!: TabDto[];
}

export class UpsertSearchConfigDto {
  @IsOptional()
  @IsArray()
  synonyms?: unknown[];

  @IsOptional()
  @IsObject()
  boosts?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  facets?: unknown[];

  @IsOptional()
  @IsObject()
  suggestConfig?: Record<string, unknown>;
}
