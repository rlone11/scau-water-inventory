import { supabase } from '../lib/supabase';
import type { BorrowRecord, BorrowStatus } from '../types';

function rowToRecord(row: Record<string, unknown>): BorrowRecord {
  return {
    id: row.id as string,
    itemId: row.item_id as string,
    itemName: row.item_name as string,
    borrowerName: row.borrower_name as string,
    borrowerId: row.borrower_id as string,
    phone: row.phone as string,
    department: row.department as string,
    purpose: row.purpose as string,
    quantity: row.quantity as number,
    borrowDate: row.borrow_date as string,
    expectedReturnDate: row.expected_return_date as string,
    actualReturnDate: row.actual_return_date as string | undefined,
    status: row.status as BorrowStatus,
    damagedQty: row.damaged_qty as number | undefined,
    damagedNote: row.damaged_note as string | undefined,
  };
}

function recordToRow(rec: Partial<BorrowRecord> & { id: string }): Record<string, unknown> {
  return {
    id: rec.id,
    item_id: rec.itemId,
    item_name: rec.itemName,
    borrower_name: rec.borrowerName,
    borrower_id: rec.borrowerId,
    phone: rec.phone,
    department: rec.department,
    purpose: rec.purpose,
    quantity: rec.quantity,
    borrow_date: rec.borrowDate,
    expected_return_date: rec.expectedReturnDate,
    actual_return_date: rec.actualReturnDate ?? null,
    status: rec.status,
    damaged_qty: rec.damagedQty ?? null,
    damaged_note: rec.damagedNote ?? null,
  };
}

export async function fetchRecords(): Promise<BorrowRecord[]> {
  const { data, error } = await supabase
    .from('borrow_records')
    .select('*')
    .order('borrow_date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

export async function createRecord(rec: BorrowRecord): Promise<BorrowRecord> {
  const row = recordToRow(rec);
  const { data, error } = await supabase
    .from('borrow_records')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return rowToRecord(data as Record<string, unknown>);
}

export async function updateRecord(id: string, updates: Partial<BorrowRecord>): Promise<void> {
  const row = recordToRow({ id, ...updates });
  const { error } = await supabase
    .from('borrow_records')
    .update(row)
    .eq('id', id);

  if (error) throw error;
}

export async function fetchRecordById(id: string): Promise<BorrowRecord | null> {
  const { data, error } = await supabase
    .from('borrow_records')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToRecord(data as Record<string, unknown>);
}
