import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservationService, ReservationEntry } from '../reservation.service';

interface Seat {
  /** Globally unique seat id (1..250 across all tables) */
  id: number;
  /** True when reserved by a user */
  booked: boolean;
  /** True when blocked by admin */
  adminBlocked: boolean;
}

interface Table {
  id: number;
  seats: Seat[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  tables: Table[] = [];
  tableRows: Table[][] = [];
  tableGroups = [4, 3, 4, 3, 4, 3, 4];

  reservations: ReservationEntry[] = [];

  /** The id of the reservation currently being edited, if any. When null
   *  the form operates in add mode. */
  editingId: number | null = null;

  // Fields for the add reservation form in the admin dashboard
  newName = '';
  newPhone = '';
  /** The selected pack for admin reservation (table, duo, ticket). */
  selectedPackAdmin: string = '';
  /** Selected table id for admin reservation. Null when none selected. */
  selectedTableAdmin: number | null = null;
  /** Selected seat id (1-10) for single-seat packs. Null when not applicable. */
  selectedSeatAdmin: number | null = null;

  constructor(private reservationService: ReservationService, private router: Router) {}

  ngOnInit(): void {
    // Check admin auth
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    if (!isAdmin) {
      // redirect to login page if not authenticated
      this.router.navigateByUrl('/admin-login');
      return;
    }
    // Initialise seats like in user reservation component (10 seats per table)
    for (let i = 1; i <= 25; i++) {
      const seats: Seat[] = [];
      for (let j = 1; j <= 10; j++) {
        seats.push({ id: (i - 1) * 10 + j, booked: false, adminBlocked: false });
      }
      this.tables.push({ id: i, seats });
    }
    // Apply booked statuses from service
    this.applySeatStatuses();
    // group tables into rows
    let startIndex = 0;
    for (const count of this.tableGroups) {
      const rowTables = this.tables.slice(startIndex, startIndex + count);
      this.tableRows.push(rowTables);
      startIndex += count;
    }
    // Load existing reservations
    this.reservations = this.reservationService.getReservations();
  }

  /**
   * Compute the list of available table numbers based on the selected pack.
   * For a table pack, only tables where all 10 seats are free are returned.
   * For a duo pack, tables with at least 2 free seats are returned.
   * For a ticket, tables with at least 1 free seat are returned.
   */
  getAvailableTables(): number[] {
    const statuses = this.reservationService.getSeatStatuses();
    const counts: { [key: number]: number } = {};
    // initialise free seat counts per table
    for (let table = 1; table <= 25; table++) {
      counts[table] = 10;
    }
    // When editing a reservation, treat its seats as free so that the table
    // remains selectable even if it would otherwise appear full.
    let editingSeats: { tableId: number; seatId: number }[] = [];
    if (this.editingId !== null) {
      const r = this.reservations.find(res => res.id === this.editingId);
      if (r) {
        editingSeats = r.seats;
      }
    }
    statuses.forEach(status => {
      const isEditingSeat = editingSeats.some(s => s.tableId === status.tableId && s.seatId === status.seatId);
      if (!isEditingSeat) {
        counts[status.tableId] = (counts[status.tableId] || 0) - 1;
      }
    });
    // Determine required free seats based on pack type
    const packLower = this.selectedPackAdmin.toLowerCase();
    const required = packLower.includes('table') ? 10 : (packLower.includes('duo') ? 2 : 1);
    return Object.keys(counts)
      .map(key => parseInt(key, 10))
      .filter(tableId => counts[tableId] >= required);
  }

  /**
   * Compute the list of free seats (1-10) for the currently selected table.
   */
  getAvailableSeats(): number[] {
    if (this.selectedTableAdmin === null) {
      return [];
    }
    const statuses = this.reservationService.getSeatStatuses();
    const freeSeats: number[] = [];
    // Determine seats belonging to the reservation being edited (if any) so
    // that these seats are considered free during editing.
    let editingSeats: { tableId: number; seatId: number }[] = [];
    if (this.editingId !== null) {
      const r = this.reservations.find(res => res.id === this.editingId);
      if (r) {
        editingSeats = r.seats;
      }
    }
    for (let seat = 1; seat <= 10; seat++) {
      const occupied = statuses.some(s => s.tableId === this.selectedTableAdmin && s.seatId === seat);
      const isEditingSeat = editingSeats.some(s => s.tableId === this.selectedTableAdmin && s.seatId === seat);
      if (!occupied || isEditingSeat) {
        freeSeats.push(seat);
      }
    }
    // If the admin selected a duo pack, filter to only seats that have an adjacent free seat.
    if (this.selectedPackAdmin && this.selectedPackAdmin.toLowerCase().includes('duo')) {
      const contiguous: number[] = [];
      freeSeats.forEach(seatNum => {
        const next = seatNum === 10 ? 1 : seatNum + 1;
        if (freeSeats.includes(next)) {
          contiguous.push(seatNum);
        }
      });
      return contiguous;
    }
    // For other packs, return all free seats
    return freeSeats;
  }

  /**
   * Compute a comma-separated string of table numbers used in a reservation.
   * This is used in the admin table display.
   */
  getTableNumbers(r: ReservationEntry): string {
    const unique = Array.from(new Set(r.seats.map(seat => seat.tableId)));
    return unique.join(', ');
  }

  /**
   * Compute the total price for a reservation based on its pack type.
   * Table pack: 1700 DH, Duo: 320 DH, Ticket: 150 DH.
   * For any other pack, defaults to 150 DH per seat.
   */
  getTotalPrice(r: ReservationEntry): number {
    const packLower = r.pack.toLowerCase();
    if (packLower.includes('table')) {
      return 1700;
    } else if (packLower.includes('duo')) {
      return 320;
    } else if (packLower.includes('ticket')) {
      return 150;
    }
    // Default: multiply number of seats by single ticket price
    return r.seats.length * 150;
  }

  /**
   * Handler for when the selected pack changes. Resets table and seat selections.
   */
  onPackChange(): void {
    this.selectedTableAdmin = null;
    this.selectedSeatAdmin = null;
  }

  /**
   * Handler for when the selected table changes. Resets seat selection.
   */
  onTableChange(): void {
    this.selectedSeatAdmin = null;
  }

  /**
   * Begin editing an existing reservation. Populates the form fields
   * based on the reservation's data and sets editingId. The pack,
   * table, and seat selections are inferred from the reservation's
   * seats. For table packs the table id is taken from the first seat;
   * for duo or single tickets both table and seat are taken from
   * the first seat in the list.
   */
  editReservation(reservation: ReservationEntry): void {
    this.editingId = reservation.id;
    this.newName = reservation.name;
    this.newPhone = reservation.phone;
    this.selectedPackAdmin = reservation.pack;
    // Determine table and seat selections
    if (reservation.seats && reservation.seats.length > 0) {
      const firstSeat = reservation.seats[0];
      this.selectedTableAdmin = firstSeat.tableId;
      if (!reservation.pack.toLowerCase().includes('table')) {
        // For duo or single packs, set the specific seat
        this.selectedSeatAdmin = firstSeat.seatId;
      } else {
        this.selectedSeatAdmin = null;
      }
    } else {
      this.selectedTableAdmin = null;
      this.selectedSeatAdmin = null;
    }
    // Ensure dropdowns update properly
    this.onPackChange();
    if (this.selectedTableAdmin !== null) {
      this.onTableChange();
    }
  }

  /**
   * Cancel the editing state and reset form fields. This returns the
   * form to add mode.
   */
  cancelEdit(): void {
    this.editingId = null;
    this.newName = '';
    this.newPhone = '';
    this.selectedPackAdmin = '';
    this.selectedTableAdmin = null;
    this.selectedSeatAdmin = null;
  }

  /**
   * Update an existing reservation using the values currently in the
   * form. The reservation to update is determined by editingId. This
   * method unbooks the seats associated with the original reservation,
   * computes a new seat list according to the selected pack and table,
   * updates the reservation in the service, books the new seats, and
   * refreshes both the reservations table and the seating plan. After
   * updating the reservation, the editing state is cleared.
   */
  updateReservationAdmin(): void {
    if (this.editingId === null || !this.newName || !this.newPhone || !this.selectedPackAdmin || this.selectedTableAdmin === null) {
      return;
    }
    // Find the old reservation
    const oldReservation = this.reservations.find(r => r.id === this.editingId);
    if (!oldReservation) {
      return;
    }
    // Build new seat list based on the selected pack
    const newSeats: { tableId: number; seatId: number }[] = [];
    const packLower = this.selectedPackAdmin.toLowerCase();
    if (packLower.includes('table')) {
      // Reserve all free seats on the selected table
      for (let seat = 1; seat <= 10; seat++) {
        const statuses = this.reservationService.getSeatStatuses();
        const occupied = statuses.some(s => s.tableId === this.selectedTableAdmin! && s.seatId === seat);
        if (!occupied) {
          newSeats.push({ tableId: this.selectedTableAdmin!, seatId: seat });
        }
      }
    } else if (packLower.includes('duo')) {
      if (this.selectedSeatAdmin !== null) {
        const first = this.selectedSeatAdmin;
        const second = first === 10 ? 1 : first + 1;
        newSeats.push({ tableId: this.selectedTableAdmin!, seatId: first });
        newSeats.push({ tableId: this.selectedTableAdmin!, seatId: second });
      } else {
        const assigned = this.reservationService.assignSeats(2);
        assigned.forEach(s => newSeats.push(s));
      }
    } else {
      // Ticket pack (single seat)
      if (this.selectedSeatAdmin !== null) {
        newSeats.push({ tableId: this.selectedTableAdmin!, seatId: this.selectedSeatAdmin });
      } else {
        const assigned = this.reservationService.assignSeats(1);
        assigned.forEach(s => newSeats.push(s));
      }
    }
    // Unbook old seats (regardless of source) then book new seats
    if (oldReservation.seats && oldReservation.seats.length > 0) {
      this.reservationService.unbookSeats(oldReservation.seats);
    }
    // Update the reservation entry in storage
    const updatedEntry = {
      name: this.newName,
      phone: this.newPhone,
      pack: this.selectedPackAdmin,
      seats: newSeats,
      timestamp: Date.now()
    } as Omit<ReservationEntry, 'id'>;
    this.reservationService.updateReservation(this.editingId, updatedEntry);
    // Book the new seats as user
    if (newSeats.length > 0) {
      this.reservationService.bookSeats(newSeats, 'user');
    }
    // Refresh reservations and seat statuses
    this.reservations = this.reservationService.getReservations();
    this.applySeatStatuses();
    // Clear form and editing state
    this.cancelEdit();
  }

  /**
   * Apply booked statuses from the reservation service to the table
   * seats.  Each seat's booked flag will reflect whether the seat is
   * currently reserved or blocked.  This should be called whenever the
   * statuses may change (e.g. when seats are toggled or new
   * reservations are added).
   */
  private applySeatStatuses(): void {
    const statuses = this.reservationService.getSeatStatuses();
    this.tables.forEach(table => {
      table.seats.forEach(seat => {
        const seatIndex = (seat.id - 1) % 10 + 1;
        const tableId = Math.floor((seat.id - 1) / 10) + 1;
        seat.booked = false;
        seat.adminBlocked = false;
        const status = statuses.find(s => s.tableId === tableId && s.seatId === seatIndex);
        if (status) {
          if (status.source === 'admin') {
            seat.adminBlocked = true;
          } else {
            seat.booked = true;
          }
        }
      });
    });
  }

  // Define relative positions for 10 seats around a square table, same as in the
  // ReservationComponent. Seats are arranged with three on the top and bottom
  // edges and two on each side.
  // Define relative positions for 10 seats arranged evenly around a circular
  // table.  These percentages match the layout used in the public
  // reservation component.  Seats are numbered clockwise starting at the
  // top (seat 1).  See reservation.component.ts for details.
  seatPositions = [
    { top: '9%', left: '45%' },   // seat 1 - top
    { top: '15%', left: '65%' }, // seat 2 - top-right
    { top: '34%', left: '78%' }, // seat 3
    { top: '55%', left: '77%' }, // seat 4
    { top: '72%', left: '66%' }, // seat 5 - bottom-right
    { top: '80%', left: '45%' },   // seat 6 - bottom
    { top: '75%', left: '25%' }, // seat 7 - bottom-left
    { top: '58%', left: '12%' }, // seat 8
    { top: '36%', left: '10%' }, // seat 9
    { top: '17.6%', left: '22%' }, // seat 10 - top-left
  ];

  /**
   * Returns inline style for seat based on its index. This matches the
   * layout used in the user reservation component so the plan appears
   * identical.
   */
  getSeatStyle(index: number) {
    const pos = this.seatPositions[index % this.seatPositions.length];
    return {
      top: pos.top,
      left: pos.left,
    };
  }

  /**
   * Toggle the booked state of a seat. This is used by admin to
   * block/unblock seats. When toggled to booked, it will show as red
   * with a cross in the plan. Toggling again will mark it as free.
   */
  toggleSeatAdmin(seat: Seat): void {
    // Convert seat.id to tableId/seatId within table (1-10)
    const tableId = Math.floor((seat.id - 1) / 10) + 1;
    const seatIndex = (seat.id - 1) % 10 + 1;
    this.reservationService.toggleSeat(tableId, seatIndex);
    // Refresh seat statuses after toggling
    this.applySeatStatuses();
  }

  /**
   * Remove a reservation entry by id and refresh the list.
   */
  deleteReservation(id: number): void {
    // Find the reservation to remove to free its seats
    const reservation = this.reservations.find(r => r.id === id);
    if (reservation) {
      // Unbook the seats associated with this reservation so they become free again
      this.reservationService.unbookSeats(reservation.seats);
      // Remove the reservation from storage
      this.reservationService.deleteReservation(id);
      // Refresh local list and seat statuses
      this.reservations = this.reservationService.getReservations();
      this.applySeatStatuses();
    }
  }

  /**
   * Generate a CSV string from the list of reservations and trigger
   * download in the browser. The CSV includes id, name, phone, pack,
   * seat count, and timestamp.
   */
  downloadCSV(): void {
    const rows: string[] = [];
    rows.push('ID,Nom,Telephone,Pack,Nombre de sièges,Date');
    this.reservations.forEach(r => {
      const date = new Date(r.timestamp).toLocaleString();
      rows.push(`${r.id},"${r.name}","${r.phone}","${r.pack}",${r.seats.length},"${date}"`);
    });
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'reservations.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Add a new reservation from the admin interface.  Uses the
   * selected pack, table and seat fields to build a reservation entry.
   *
   * For a table pack, all seats on the selected table will be reserved.
   * For a duo pack, two seats will be reserved starting from the
   * selected seat (wrapping around to seat 1 if necessary).  If the
   * second seat is not free the system will automatically assign two
   * adjacent seats using the reservation service.
   * For a ticket (single seat) pack, only the selected seat is
   * reserved.
   */
  addReservationAdmin(): void {
    if (!this.newName || !this.newPhone || !this.selectedPackAdmin || this.selectedTableAdmin === null) {
      return;
    }
    const seats: { tableId: number; seatId: number }[] = [];
    const packLower = this.selectedPackAdmin.toLowerCase();
    // Handle table pack
    if (packLower.includes('table')) {
      // Reserve all free seats on the selected table
      for (let seat = 1; seat <= 10; seat++) {
        const statuses = this.reservationService.getSeatStatuses();
        const occupied = statuses.some(s => s.tableId === this.selectedTableAdmin! && s.seatId === seat);
        if (!occupied) {
          seats.push({ tableId: this.selectedTableAdmin!, seatId: seat });
        }
      }
    } else if (packLower.includes('duo')) {
      // Reserve two adjacent seats starting from the selected seat
      if (this.selectedSeatAdmin !== null) {
        const first = this.selectedSeatAdmin;
        const second = first === 10 ? 1 : first + 1;
        seats.push({ tableId: this.selectedTableAdmin!, seatId: first });
        seats.push({ tableId: this.selectedTableAdmin!, seatId: second });
      } else {
        // No seat selected: let the service assign two seats automatically
        const assigned = this.reservationService.assignSeats(2);
        assigned.forEach(s => seats.push(s));
      }
    } else {
      // Single ticket
      if (this.selectedSeatAdmin !== null) {
        seats.push({ tableId: this.selectedTableAdmin!, seatId: this.selectedSeatAdmin });
      } else {
        const assigned = this.reservationService.assignSeats(1);
        assigned.forEach(s => seats.push(s));
      }
    }
    const entry = {
      name: this.newName,
      phone: this.newPhone,
      pack: this.selectedPackAdmin,
      seats,
      timestamp: Date.now()
    } as Omit<ReservationEntry, 'id'>;
    this.reservationService.addReservation(entry);
    // Book these seats for public view
    if (seats.length > 0) {
      this.reservationService.bookSeats(seats, 'user');
    }
    // Refresh reservations and seat statuses
    this.reservations = this.reservationService.getReservations();
    this.applySeatStatuses();
    // Reset form fields
    this.newName = '';
    this.newPhone = '';
    this.selectedPackAdmin = '';
    this.selectedTableAdmin = null;
    this.selectedSeatAdmin = null;
  }
}