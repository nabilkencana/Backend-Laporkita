import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { CategoryWithAgency } from './categories.repository.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Read endpoints are Public
  @Public()
  @Get()
  async findAll(): Promise<CategoryWithAgency[]> {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryWithAgency> {
    return this.categoriesService.findById(id);
  }

  // Mutation endpoints are Admin-Only
  @Post()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryWithAgency> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryWithAgency> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.categoriesService.delete(id);
  }
}
