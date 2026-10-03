import { invoke } from "@tauri-apps/api/core";

export interface CompanyItem {
  id: string;
  externalId?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  country?: string | null;
  active: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface CreateCompanyPayload {
  id?: string;
  externalId?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  country?: string | null;
  active?: boolean;
}

export interface UpdateCompanyPayload {
  id: string;
  externalId?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  country?: string | null;
  active?: boolean;
  deletedAt?: string | null;
}

export const companyService = {
  async getAll(): Promise<CompanyItem[]> {
    return await invoke<CompanyItem[]>("get_companies");
  },

  async getById(id: string): Promise<CompanyItem> {
    return await invoke<CompanyItem>("get_company_by_id", { id });
  },

  async create(payload: CreateCompanyPayload): Promise<CompanyItem> {
    return await invoke<CompanyItem>("create_company", { payload });
  },

  async update(payload: UpdateCompanyPayload): Promise<CompanyItem> {
    return await invoke<CompanyItem>("update_company", { payload });
  },

  async delete(id: string): Promise<boolean> {
    return await invoke<boolean>("delete_company", { id });
  },
};
