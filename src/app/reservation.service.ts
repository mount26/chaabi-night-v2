import { Injectable } from '@angular/core';

export interface ReservationEntry {
  id: number;
  name: string;
  phone: string;
  pack: string;
  seats: { tableId: number; seatId: number }[];
  timestamp: number;
}

/*
 * A simple service for storing and retrieving reservations. The service
 * persists data to the browser's localStorage under the key
 * 'chaabiReservations'. Each reservation entry contains a unique id,
 * personal details, the pack name, the list of seats (if any), and a
 * timestamp. New reservations are appended to the existing list.
 */
@Injectable({ providedIn: 'root' })
export class ReservationService {
  private storageKey = 'chaabiReservations';

  /**
   * Key used to persist the list of booked seats. Each booked seat is
   * represented as an object containing tableId and seatId. When a seat
   * appears in this array it will be considered unavailable in both
   * public and admin views. Admin can toggle seats to add or remove
   * entries from this list.
   */
  private seatKey = 'chaabiSeatStatuses';

  /**
   * Load all reservations from localStorage. If nothing is stored it
   * returns an empty array.
   */
  getReservations(): ReservationEntry[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) as ReservationEntry[] : [];
    } catch (err) {
      return [];
    }
  }

  /**
   * Save the provided list of reservations into localStorage.
   */
  private saveReservations(reservations: ReservationEntry[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(reservations));
  }

  /**
   * Add a new reservation entry to the stored list. Generates a new id
   * based on current timestamp and length of existing reservations.
   */
  addReservation(entry: Omit<ReservationEntry, 'id'>): void {
    const reservations = this.getReservations();
    const newId = reservations.length > 0 ? reservations[reservations.length - 1].id + 1 : 1;
    const newEntry: ReservationEntry = { id: newId, ...entry };
    reservations.push(newEntry);
    this.saveReservations(reservations);
  }

  /**
   * Delete a reservation entry by id. Returns true if something was
   * removed.
   */
  deleteReservation(id: number): boolean {
    const reservations = this.getReservations();
    const index = reservations.findIndex(r => r.id === id);
    if (index > -1) {
      reservations.splice(index, 1);
      this.saveReservations(reservations);
      return true;
    }
    return false;
  }

  /**
   * Update an existing reservation identified by id.  Replaces the entry
   * with the provided data (keeping the same id). Returns true if the
   * reservation was found and updated.
   */
  updateReservation(id: number, entry: Omit<ReservationEntry, 'id'>): boolean {
    const reservations = this.getReservations();
    const index = reservations.findIndex(r => r.id === id);
    if (index > -1) {
      reservations[index] = { id, ...entry } as ReservationEntry;
      this.saveReservations(reservations);
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------- */
  /* Seat status management                                              */

  /**
   * Load the list of seat statuses from localStorage.  The persisted
   * value contains an array of objects with the shape
   * `{ tableId, seatId, source }`, where `source` is either `'user'`
   * (reserved by a customer) or `'admin'` (blocked by the administrator).
   *
   * To maintain backwards compatibility with older storage formats that
   * did not include a `source` property, this method will infer
   * `source: 'user'` for any entry lacking the property.  If nothing is
   * stored, it returns an empty array.
   */
  getSeatStatuses(): { tableId: number; seatId: number; source: 'user' | 'admin' }[] {
    try {
      const raw = localStorage.getItem(this.seatKey);
      const parsed: any[] = raw ? JSON.parse(raw) : [];
      return parsed.map(item => {
        if (item && typeof item === 'object') {
          return {
            tableId: item.tableId,
            seatId: item.seatId,
            source: item.source === 'admin' ? 'admin' : 'user'
          };
        }
        return { tableId: 0, seatId: 0, source: 'user' as const };
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Save the provided list of booked seats back into localStorage.
   */
  private saveSeatStatuses(statuses: { tableId: number; seatId: number; source: 'user' | 'admin' }[]): void {
    localStorage.setItem(this.seatKey, JSON.stringify(statuses));
  }

  /**
   * Mark a list of seats as booked. If a seat is already booked it
   * remains unchanged. After updating the list it persists the result.
   */
  bookSeats(
    seats: { tableId: number; seatId: number }[],
    source: 'user' | 'admin' = 'user'
  ): void {
    const statuses = this.getSeatStatuses();
    seats.forEach(seat => {
      const exists = statuses.some(s => s.tableId === seat.tableId && s.seatId === seat.seatId);
      if (!exists) {
        statuses.push({ tableId: seat.tableId, seatId: seat.seatId, source });
      }
    });
    this.saveSeatStatuses(statuses);
  }

  /**
   * Remove a list of seats from the booked seat list. If a seat is
   * currently booked it will be removed; otherwise no change. Useful
   * when admin unblocks seats.
   */
  unbookSeats(seats: { tableId: number; seatId: number }[]): void {
    let statuses = this.getSeatStatuses();
    seats.forEach(seat => {
      statuses = statuses.filter(s => !(s.tableId === seat.tableId && s.seatId === seat.seatId));
    });
    this.saveSeatStatuses(statuses);
  }

  /**
   * Toggle a single seat's status. If the seat is already booked it
   * becomes unbooked; otherwise it becomes booked. Persists the
   * resulting status list.
   */
  toggleSeat(tableId: number, seatId: number): void {
    const statuses = this.getSeatStatuses();
    const index = statuses.findIndex(s => s.tableId === tableId && s.seatId === seatId);
    if (index > -1) {
      statuses.splice(index, 1);
    } else {
      statuses.push({ tableId, seatId, source: 'admin' });
    }
    this.saveSeatStatuses(statuses);
  }

  /**
   * Assign a number of random seats for a pack reservation. The method
   * checks for free seats (not in the booked list) and selects the
   * requested amount. If there are not enough free seats it returns as
   * many as available. Each assigned seat is immediately booked via
   * bookSeats() so that subsequent calls will not reuse the same seats.
   */
  assignSeats(count: number): { tableId: number; seatId: number }[] {
    const statuses = this.getSeatStatuses();
    const isFree = (tableId: number, seatId: number) =>
      !statuses.some(s => s.tableId === tableId && s.seatId === seatId);
    const chosen: { tableId: number; seatId: number }[] = [];

    // Table pack: pick a table with all seats free
    if (count === 10) {
      for (let table = 1; table <= 25; table++) {
        let free = true;
        for (let seat = 1; seat <= 10; seat++) {
          if (!isFree(table, seat)) {
            free = false;
            break;
          }
        }
        if (free) {
          for (let seat = 1; seat <= 10; seat++) {
            chosen.push({ tableId: table, seatId: seat });
          }
          break;
        }
      }
    }

    // Duo pack: find two adjacent free seats in same table
    if (count === 2 && chosen.length === 0) {
      outer: for (let table = 1; table <= 25; table++) {
        const freeSeats: number[] = [];
        for (let seat = 1; seat <= 10; seat++) {
          if (isFree(table, seat)) {
            freeSeats.push(seat);
          }
        }
        freeSeats.sort((a, b) => a - b);
        for (let i = 0; i < freeSeats.length; i++) {
          const seat = freeSeats[i];
          const nextSeat = seat === 10 ? 1 : seat + 1;
          if (freeSeats.includes(nextSeat)) {
            chosen.push({ tableId: table, seatId: seat });
            chosen.push({ tableId: table, seatId: nextSeat });
            break outer;
          }
        }
      }
    }

    // Fallback: random seats
    if (chosen.length === 0) {
      const freeSeats: { tableId: number; seatId: number }[] = [];
      for (let table = 1; table <= 25; table++) {
        for (let seat = 1; seat <= 10; seat++) {
          if (isFree(table, seat)) {
            freeSeats.push({ tableId: table, seatId: seat });
          }
        }
      }
      for (let i = 0; i < count && freeSeats.length > 0; i++) {
        const idx = Math.floor(Math.random() * freeSeats.length);
        const seat = freeSeats.splice(idx, 1)[0];
        chosen.push(seat);
      }
    }
    // Mark as booked with source 'user'
    this.bookSeats(chosen, 'user');
    return chosen;
  }
}