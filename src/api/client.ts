import createClient from "openapi-fetch";
import type { paths } from "../types/api"; // automatically generated from your yaml

const client = createClient<paths>({
  baseUrl: "/", // Hooks directly to your Cloudflare Pages edge setup
});

export async function getEstimate(body: {
  labor: number;
  parts: number;
  vin: string;
}) {
  const { data, error } = await client.POST("/api/estimate", {
    body,
  });
  if (error) throw error;
  return data;
}

export async function diagnose(input: {
  vin: string;
  symptoms: string[];
  codes: string[];
  notes?: string;
}) {
  const { data, error } = await client.POST("/api/diagnose", {
    body: input,
  });
  if (error) throw error;
  return data;
}

export async function getInvoice(body: {
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
  };
  labor: number;
  parts: number;
  codes: string[];
}) {
  const { data, error } = await client.POST("/api/invoice", {
    body: {
      ...body,
      // Forcing standard numeric types for calculation security
      labor: Number(body.labor),
      parts: Number(body.parts)
    },
  });
  if (error) throw error;
  return data;
}
