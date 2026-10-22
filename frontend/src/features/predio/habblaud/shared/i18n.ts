// Substitui o i18n do habblaud: no protótipo só existe português, então `tr` só preenche os {0}, {1}...
// (mesma assinatura do original, para a arte copiada não precisar mudar).
export function tr(src: string, args?: readonly unknown[]): string {
  if (!args || args.length === 0) return src;
  return src.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}
