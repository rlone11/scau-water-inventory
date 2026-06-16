import { supabase } from '../lib/supabase';
import type { Item, ItemCategory } from '../types';

// Map DB column names (snake_case) to JS fields (camelCase)
function rowToItem(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    name: row.name as string,
    code: row.code as string,
    category: row.category as ItemCategory,
    quantity: row.quantity as number,
    availableQty: row.available_qty as number,
    location: row.location as string,
    photo: row.photo as string | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function itemToRow(item: Partial<Item> & { id: string }): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    category: item.category,
    quantity: item.quantity,
    available_qty: item.availableQty,
    location: item.location,
    photo: item.photo ?? null,
    notes: item.notes ?? null,
    created_at: item.createdAt ?? new Date().toISOString(),
    updated_at: item.updatedAt ?? new Date().toISOString(),
  };
}

export async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToItem);
}

export async function createItem(
  input: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> & { id: string; createdAt: string; updatedAt: string },
): Promise<Item> {
  const row = itemToRow(input);
  const { data, error } = await supabase
    .from('items')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return rowToItem(data as Record<string, unknown>);
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<void> {
  const row = itemToRow({ id, ...updates });
  const { error } = await supabase
    .from('items')
    .update(row)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchItemById(id: string): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToItem(data as Record<string, unknown>);
}
