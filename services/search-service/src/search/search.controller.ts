import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { DidYouMeanDto, SearchDto, SuggestDto } from './dto';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Post('search')
  @HttpCode(200)
  searchPost(@Body() dto: SearchDto) {
    return this.search.search(dto);
  }

  @Get('suggest')
  suggest(@Query() dto: SuggestDto) {
    return this.search.suggest(dto);
  }

  @Get('autocomplete')
  autocomplete(@Query() dto: SuggestDto) {
    return this.search.autocomplete(dto);
  }

  @Post('did-you-mean')
  @HttpCode(200)
  didYouMean(@Body() dto: DidYouMeanDto) {
    return this.search.didYouMean(dto);
  }
}
