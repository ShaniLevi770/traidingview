import type { Importer } from "@/lib/importers/types";
import { colmexImporter } from "@/lib/importers/colmex";
import { colmexOrderHistoryImporter } from "@/lib/importers/colmexOrderHistory";

/**
 * Registry of every broker importer. Adding a new broker means adding one
 * module (see lib/importers/colmex/ for the shape) and one line here -
 * nothing else in the import UI/route/audit-trail changes.
 */
export const importers: Record<string, Importer> = {
  [colmexImporter.id]: colmexImporter,
  [colmexOrderHistoryImporter.id]: colmexOrderHistoryImporter,
};

export function getImporter(brokerId: string): Importer | undefined {
  return importers[brokerId];
}
