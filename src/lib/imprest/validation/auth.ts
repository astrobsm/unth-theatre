import { z } from 'zod';
import { UserRole } from '../enums';
import {
  emailSchema,
  optionalText,
  phoneSchema,
  requiredText,
  staffNumberSchema,
  uuidSchema,
} from './common';

/**
 * Password policy for a government finance system: length does the heavy
 * lifting, with a character-class floor to keep out `password1`. The check is
 * expressed as explicit refinements so the UI can show which rule failed.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[a-z]/.test(v), 'Include a lower-case letter')
  .refine((v) => /[A-Z]/.test(v), 'Include an upper-case letter')
  .refine((v) => /[0-9]/.test(v), 'Include a digit')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Include a symbol')
  .refine((v) => !/(.)\1{3,}/.test(v), 'Avoid repeating the same character four or more times');

export const loginSchema = z.object({
  /** Staff number or email — officers know their staff number, admins their email. */
  identifier: requiredText('Staff number or email', 254),
  password: z.string().min(1, 'Password is required').max(128),
  deviceLabel: z.string().trim().max(120).optional(),
  rememberDevice: z.boolean().default(false),
});

export const twoFactorVerifySchema = z.object({
  challengeToken: requiredText('Challenge token', 512),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code')
    .or(z.string().trim().regex(/^[A-Z0-9]{10}$/, 'Enter a 10-character recovery code')),
});

export const twoFactorEnableSchema = z.object({
  secret: requiredText('Secret', 128),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, 'Confirm with your password'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const refreshTokenSchema = z.object({
  refreshToken: requiredText('Refresh token', 1024),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'The new password must differ from the current one',
    path: ['newPassword'],
  });

export const resetPasswordSchema = z
  .object({
    userId: uuidSchema,
    newPassword: passwordSchema,
    mustChangePassword: z.boolean().default(true),
  });

export const createUserSchema = z.object({
  staffNumber: staffNumberSchema,
  fullName: requiredText('Full name', 160),
  email: emailSchema,
  phone: phoneSchema.nullish().transform((v) => v ?? null),
  designation: requiredText('Designation', 120),
  role: z.nativeEnum(UserRole),
  departmentId: uuidSchema.nullish().transform((v) => v ?? null),
  password: passwordSchema,
  mustChangePassword: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  fullName: requiredText('Full name', 160).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.nullish().transform((v) => v ?? null).optional(),
  designation: requiredText('Designation', 120).optional(),
  role: z.nativeEnum(UserRole).optional(),
  departmentId: uuidSchema.nullish().transform((v) => v ?? null).optional(),
  isActive: z.boolean().optional(),
  version: z.number().int().min(0),
});

export const saveSignatureSchema = z.object({
  imageData: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'The signature must be a PNG data URL')
    .max(2_000_000, 'Signature image is too large'),
  notes: optionalText(240),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
