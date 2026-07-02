import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name").max(120),
  email: z.email("Enter a valid email").max(160),
  phone: z
    .string()
    .trim()
    .min(10, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Enter a valid phone number"),
  nin: z
    .string()
    .trim()
    .regex(/^\d{11}$/, "NIN must be 11 digits")
    .optional()
    .or(z.literal("")),
  state: z.string().trim().min(1, "Select your state"),
  lga: z.string().trim().min(1, "Select your LGA"),
  ward: z.string().trim().min(1, "Select your ward"),
  pollingUnit: z.string().trim().min(1, "Select your polling unit"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.infer<typeof loginSchema>;
