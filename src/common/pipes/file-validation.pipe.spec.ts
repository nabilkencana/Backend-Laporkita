import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { FileValidationPipe } from './file-validation.pipe.js';

describe('FileValidationPipe (F4-1: Rules.md §2.1 & Architecture.md §7)', () => {
  let pipe: FileValidationPipe;

  beforeEach(() => {
    pipe = new FileValidationPipe();
  });

  it('should throw BadRequestException when file is missing (default required)', async () => {
    await expect(pipe.transform(undefined)).rejects.toThrow(BadRequestException);
  });

  it('should return undefined when file is missing and optional is true', async () => {
    const optionalPipe = new FileValidationPipe({ optional: true });
    const result = await optionalPipe.transform(undefined);
    expect(result).toBeUndefined();
  });

  it('should throw BadRequestException when file size exceeds 8MB', async () => {
    const fakeLargeFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'large.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.alloc(8 * 1024 * 1024 + 100), // > 8MB
      size: 8 * 1024 * 1024 + 100,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    await expect(pipe.transform(fakeLargeFile)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file is fake JPEG (magic bytes mismatch)', async () => {
    const fakeFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'fake.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('THIS IS JUST PLAIN TEXT, NOT A REAL IMAGE'),
      size: 40,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    await expect(pipe.transform(fakeFile)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file is WebP format (only JPEG/PNG allowed)', async () => {
    const webpBuffer = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .webp()
      .toBuffer();

    const webpFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'image.webp',
      encoding: '7bit',
      mimetype: 'image/webp',
      buffer: webpBuffer,
      size: webpBuffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    await expect(pipe.transform(webpFile)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when resolution is below 480p (<480x480)', async () => {
    const smallJpgBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const smallFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'small.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: smallJpgBuffer,
      size: smallJpgBuffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    await expect(pipe.transform(smallFile)).rejects.toThrow(BadRequestException);
  });

  it('should accept valid JPEG file with resolution >= 480p', async () => {
    const validJpgBuffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    const validFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'valid.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: validJpgBuffer,
      size: validJpgBuffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const result = await pipe.transform(validFile);
    expect(result).toBeDefined();
    expect(result?.mimetype).toBe('image/jpeg');
  });

  it('should accept valid PNG file with resolution >= 480p', async () => {
    const validPngBuffer = await sharp({
      create: {
        width: 480,
        height: 480,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const validFile: Express.Multer.File = {
      fieldname: 'photo',
      originalname: 'valid.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: validPngBuffer,
      size: validPngBuffer.length,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const result = await pipe.transform(validFile);
    expect(result).toBeDefined();
    expect(result?.mimetype).toBe('image/png');
  });
});
