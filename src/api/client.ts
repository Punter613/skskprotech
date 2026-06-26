import createClient from "openapi-fetch";
import type { paths, components } from "../types/api";

const client = createClient<paths>({
  baseUrl: "/", // Cloudflare Pages Edge target
});

export async function getEstimate(body: {
  id: string;
  labor: number;
  parts: number;
  vin: string;
}) {
  const { data, error } = await client.POST("/api/estimateHeuristic", {
    body,
  });
  if (error) throw error;
  return data;
}

export async function diagnose(body: {
  id: string;
  vehicle?: {
    year?: number;
    make?: string;
    trim?: string;
  };
  obdCodes?: string[];
  customerStates?: string[];
}) {
  const { data, error } = await client.POST("/api/diagnose", {
    body,
  });
  if (error) throw error;
  return data;
}

export async function getInvoice(body: {
  id: string;
  customer: {
    name?: string;
    phone?: string;
  };
  vehicle: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
  };
  labor: number;
  parts: components["schemas"]["Part"][];
  codes: string[];
}) {
  const { data, error } = await client.POST("/api/invoice", {
    body,
  });
  if (error) throw error;
  return data;
}
