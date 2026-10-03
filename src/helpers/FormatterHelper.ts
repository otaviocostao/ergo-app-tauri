export class FormatterHelper {
  /**
   * Formata uma string de CNPJ mantendo caracteres alfanuméricos
   * no padrão oficial da Receita Federal: XX.XXX.XXX/XXXX-XX
   * (suporta os novos CNPJs alfanuméricos com letras e números).
   *
   * @param value String do CNPJ a ser formatada
   * @returns String formatada no padrão
   */
  static formatCnpj(value?: string | null): string {
    if (!value) {
      return "";
    }

    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    if (!cleaned) {
      return "";
    }

    const truncated = cleaned.slice(0, 14);

    if (truncated.length <= 2) {
      return truncated;
    }
    if (truncated.length <= 5) {
      return truncated.replace(/^([A-Z0-9]{2})([A-Z0-9]+)$/, "$1.$2");
    }
    if (truncated.length <= 8) {
      return truncated.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]+)$/, "$1.$2.$3");
    }
    if (truncated.length <= 12) {
      return truncated.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]+)$/, "$1.$2.$3/$4");
    }

    return truncated.replace(
      /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([A-Z0-9]{1,2})$/,
      "$1.$2.$3/$4-$5"
    );
  }

  /**
   * Formata uma string no padrão de CEP brasileiro: XXXXX-XXX
   *
   * @param value String do CEP a ser formatada
   * @returns String formatada no padrão XXXXX-XXX
   */
  static formatCep(value?: string | null): string {
    if (!value) {
      return "";
    }

    const digits = value.replace(/\D/g, "");

    if (!digits) {
      return "";
    }

    const truncated = digits.slice(0, 8);

    if (truncated.length <= 5) {
      return truncated;
    }

    return truncated.replace(/^(\d{5})(\d{1,3})$/, "$1-$2");
  }

  /**
   * Formata uma string no padrão de telefone brasileiro:
   * (XX) XXXX-XXXX (fixo, 10 dígitos) ou (XX) XXXXX-XXXX (celular, 11 dígitos).
   *
   * @param value String do telefone a ser formatada
   * @returns String formatada no padrão de telefone
   */
  static formatPhone(value?: string | null): string {
    if (!value) {
      return "";
    }

    let digits = value.replace(/\D/g, "");

    if (!digits) {
      return "";
    }

    if (digits.length > 11 && digits.startsWith("55")) {
      digits = digits.slice(2);
    }

    if (digits.startsWith("0800")) {
      const truncated = digits.slice(0, 11);
      if (truncated.length <= 4) {
        return truncated;
      }
      if (truncated.length <= 7) {
        return `${truncated.slice(0, 4)} ${truncated.slice(4)}`;
      }
      return `${truncated.slice(0, 4)} ${truncated.slice(4, 7)} ${truncated.slice(7)}`;
    }

    const truncated = digits.slice(0, 11);

    if (truncated.length <= 2) {
      return `(${truncated}`;
    }
    if (truncated.length <= 6) {
      return `(${truncated.slice(0, 2)}) ${truncated.slice(2)}`;
    }
    if (truncated.length <= 10) {
      return `(${truncated.slice(0, 2)}) ${truncated.slice(2, 6)}-${truncated.slice(6)}`;
    }

    return `(${truncated.slice(0, 2)}) ${truncated.slice(2, 7)}-${truncated.slice(7, 11)}`;
  }
}

export const formatCnpj = FormatterHelper.formatCnpj;
export const formatCep = FormatterHelper.formatCep;
export const formatPhone = FormatterHelper.formatPhone;
export default FormatterHelper;
