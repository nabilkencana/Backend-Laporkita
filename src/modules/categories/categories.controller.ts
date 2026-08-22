import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import { CategoryWithAgency } from './categories.repository.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
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
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<CategoryWithAgency> {
    return this.categoriesService.findById(id);
  }

  // Mutation endpoints are Admin-Only
  @Post()
  @ApiBearerAuth()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryWithAgency> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(UserRole.admin)
  async update(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryWithAgency> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(UserRole.admin)
  async delete(@Param('id', new UuidValidationPipe()) id: string): Promise<{ message: string }> {
    return this.categoriesService.delete(id);
  }
}
