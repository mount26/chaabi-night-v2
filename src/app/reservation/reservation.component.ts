import { Component } from '@angular/core';
import { ReservationService, ReservationEntry } from '../reservation.service';

interface Seat {
  /**
   * A globally unique seat identifier. Seat ids are numbered from 1 to 250
   * across all tables (10 seats per table, 25 tables).
   */
  id: number;
  /** True when a seat has been reserved by a user (purchased). */
  booked: boolean;
  /** True when a seat has been blocked by the administrator.  These seats
   *  cannot be selected by users and appear with a distinct colour in
   *  both public and admin views. */
  adminBlocked: boolean;
}

interface Table {
  id: number;
  seats: Seat[];
}

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservation.component.html',
  styleUrls: ['./reservation.component.css']
})
export class ReservationComponent {
  // Definitions for the different ticket packs available. The table pack has
  // been updated to reflect 10 seats instead of 12. These objects are used
  // in the overview to allow quick selection of a pack. When clicked they
  // open a form for the user to fill in their details.
  packages = [
    { name: 'Pack table complète', price: 1700, description: 'Réservez une table entière de 10 places.' },
    { name: 'Pack duo', price: 320, description: 'Réservez deux places.' },
    { name: 'Ticket seul', price: 150, description: 'Réservez une place individuelle.' }
  ];

  tables: Table[] = [];
  selectedSeats: Seat[] = [];

  /**
   * A two-dimensional array that organizes the tables into rows for the
   * plan view. The number of tables in each row is defined by
   * tableGroups. This structure is computed in the constructor after
   * tables are initialised.
   */
  tableRows: Table[][] = [];

  /**
   * Defines how many tables appear in each row of the seating plan. The
   * sum of these numbers must equal the total number of tables. For
   * example [4,3,4,3,4,3,4] produces seven rows containing 4,3,4,
   * tables respectively. Adjust this array if the layout changes.
   */
  tableGroups = [4, 3, 4, 3, 4, 3, 4];

  /**
   * When true the interactive grid is shown, otherwise the overview with
   * the image and packs is displayed.
   */
  showGrid = false;

  /**
   * Indicates whether the pack form is currently visible. When true
   * selectedPack holds the pack details that were clicked.
   */
  showPackForm = false;

  /**
   * Stores the pack that the user has chosen from the overview. When
   * showPackForm is true this object is used to display pack details in
   * the form.
   */
  selectedPack: { name: string; price: number; description: string } | null = null;

  /**
   * Fields bound to the reservation form. They collect the user's name
   * and phone number. The packName is auto-filled from selectedPack
   * or derived from seat selection when finalising a seat reservation.
   */
  formName = '';
  formPhone = '';
  formPackName = '';

  /**
   * A flag to show the success message after a reservation has been
   * completed. When true the message is displayed and the forms are
   * hidden. It is reset after a timeout or a new interaction.
   */
  reservationComplete = false;

  // Note: The showGrid property is defined once earlier in this component.

  constructor(private reservationService: ReservationService) {
    // Initialise tables with 10 seats each. The number of tables is still
    // 25 but seats per table have been reduced to 10. Each seat is
    // represented by an id (unique across all tables) and booked flag.
    for (let i = 1; i <= 25; i++) {
      const seats: Seat[] = [];
      for (let j = 1; j <= 10; j++) {
        seats.push({ id: (i - 1) * 10 + j, booked: false, adminBlocked: false });
      }
      this.tables.push({ id: i, seats });
    }

    // Apply previously booked seat statuses to the seats.  Seats that have been
    // booked in the past (via pack reservation or admin) will be marked
    // unavailable.  This ensures persistence across sessions and views.
    this.applySeatStatuses();

    // Organize tables into rows according to the new layout. Each entry in
    // tableGroups defines how many tables appear in that row. For
    // example, [4, 3, 4, 3, 4, 3, 4] means the first row has 4 tables,
    // second row 3 tables, etc. The resulting structure is used in the
    // template for nested *ngFor to layout the plan.
    this.tableRows = [];
    let startIndex = 0;
    for (const count of this.tableGroups) {
      const rowTables = this.tables.slice(startIndex, startIndex + count);
      this.tableRows.push(rowTables);
      startIndex += count;
    }
  }

  /**
   * Applies the current booked seat statuses to the tables.  It fetches
   * the list of booked seats from the reservation service and sets the
   * booked flag on each seat accordingly.  This should be called
   * whenever seat statuses might have changed (e.g. after a reservation
   * is made or seats are toggled by admin).
   */
  private applySeatStatuses(): void {
    const statuses = this.reservationService.getSeatStatuses();
    this.tables.forEach(table => {
      table.seats.forEach(seat => {
        // Compute table index (1-based) and seat index within table (1-10)
        const seatIndex = (seat.id - 1) % 10 + 1;
        const tableId = Math.floor((seat.id - 1) / 10) + 1;
        // Reset flags
        seat.booked = false;
        seat.adminBlocked = false;
        // Find matching status entry
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


  toggleSeat(seat: Seat): void {
    // Do nothing if the seat is booked by a user or blocked by admin
    if (seat.booked || seat.adminBlocked) {
      return;
    }
    const index = this.selectedSeats.indexOf(seat);
    if (index > -1) {
      this.selectedSeats.splice(index, 1);
    } else {
      this.selectedSeats.push(seat);
    }
  }

  /**
   * Open the seating plan for interactive selection.  When called,
   * refresh the booked seat flags to ensure the latest statuses are
   * reflected in the view.
   */
  openGrid(): void {
    this.applySeatStatuses();
    this.showGrid = true;
  }

  isSelected(seat: Seat): boolean {
    return this.selectedSeats.includes(seat);
  }

  /**
   * Toggle the selection of all seats on a given table. This helper allows
   * purchasing a whole table in one click. If any unbooked seat on the table
   * is not yet selected, all unbooked seats will be selected. Otherwise all
   * currently selected seats on that table will be removed from the selection.
   */
  toggleTableSeats(table: Table): void {
    // Determine if there is at least one seat that is not booked and not selected
    const hasUnselected = table.seats.some(
      seat => !seat.booked && !seat.adminBlocked && !this.isSelected(seat)
    );
    if (hasUnselected) {
      table.seats.forEach(seat => {
        if (!seat.booked && !seat.adminBlocked && !this.isSelected(seat)) {
          this.selectedSeats.push(seat);
        }
      });
    } else {
      // Remove all seats from this table from the selection
      this.selectedSeats = this.selectedSeats.filter(
        seat => !table.seats.includes(seat)
      );
    }
  }

  // Define relative positions for 10 seats arranged evenly around a
  // circular table.  These values were calculated to distribute the
  // chairs along a circle with a radius of ~40% of the table size,
  // starting from the top of the circle and proceeding clockwise.  The
  // positions are expressed as percentages relative to the table
  // container.
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
   * Returns inline style for seat based on its index (0-11).
   * The returned object positions each seat around the table.
   */
  getSeatStyle(index: number) {
    const pos = this.seatPositions[index % this.seatPositions.length];
    return {
      top: pos.top,
      left: pos.left,
    };
  }

  /**
   * Opens the reservation form for a selected pack. Sets the selectedPack
   * property and pre-fills the formPackName. When a pack is chosen
   * outside of the seating plan the seat selection is cleared.
   */
  openPackForm(pack: { name: string; price: number; description: string }): void {
    this.selectedPack = pack;
    this.formPackName = pack.name;
    this.formName = '';
    this.formPhone = '';
    this.showPackForm = true;
    // Hide the grid if it was visible
    this.showGrid = false;
    // Clear selected seats since this reservation is pack-based
    this.selectedSeats = [];
  }

  /**
   * Cancels the pack reservation form. Resets related properties and
   * hides the form.
   */
  cancelPackForm(): void {
    this.showPackForm = false;
    this.selectedPack = null;
    this.formName = '';
    this.formPhone = '';
    this.formPackName = '';
  }

  /**
   * Called when the user submits the pack reservation form. It creates a
   * new reservation entry and stores it via the ReservationService.
   * After saving the reservation the form is reset and a success
   * message is displayed.
   */
  finalizePackReservation(): void {
    if (!this.selectedPack) return;
    // Determine how many seats to assign based on the selected pack.  A table
    // pack reserves 10 seats, duo reserves 2, and ticket reserves 1.  Any
    // other pack defaults to 1 seat.
    let seatCount = 1;
    if (this.selectedPack.name.toLowerCase().includes('table')) {
      seatCount = 10;
    } else if (this.selectedPack.name.toLowerCase().includes('duo')) {
      seatCount = 2;
    } else {
      seatCount = 1;
    }
    // Assign seats randomly from the available pool and book them
    const assigned = this.reservationService.assignSeats(seatCount);
    // Build a reservation entry including the assigned seats
    const entry = {
      name: this.formName,
      phone: this.formPhone,
      pack: this.selectedPack.name,
      seats: assigned,
      timestamp: Date.now()
    } as Omit<ReservationEntry, 'id'>;
    this.reservationService.addReservation(entry);
    // Refresh seat statuses in the UI
    this.applySeatStatuses();
    this.reservationComplete = true;
    this.showPackForm = false;
    // Reset form values
    this.selectedPack = null;
    this.formName = '';
    this.formPhone = '';
    this.formPackName = '';
    // Hide success message after 5 seconds
    setTimeout(() => {
      this.reservationComplete = false;
    }, 5000);
  }

  /**
   * Finalises a seat selection reservation. It determines the pack
   * automatically based on the number of selected seats (1 seat ->
   * ticket seul, 2 seats -> pack duo, 10 seats -> pack table complète),
   * builds the seat list, stores the reservation via the service, and
   * clears the selected seats.
   */
  finalizeSeatReservation(): void {
    if (this.selectedSeats.length === 0) return;
    // Determine pack name based on number of seats selected
    let packName = 'Sélection personnalisée';
    if (this.selectedSeats.length === 1) {
      packName = 'Ticket seul';
    } else if (this.selectedSeats.length === 2) {
      packName = 'Pack duo';
    } else if (this.selectedSeats.length === 10) {
      packName = 'Pack table complète';
    }
    this.formPackName = packName;
    const seats = this.selectedSeats.map(seat => {
      const tableId = Math.floor((seat.id - 1) / 10) + 1;
      const seatIndex = ((seat.id - 1) % 10) + 1;
      return { tableId, seatId: seatIndex };
    });
    const entry = {
      name: this.formName,
      phone: this.formPhone,
      pack: packName,
      seats: seats,
      timestamp: Date.now()
    } as Omit<ReservationEntry, 'id'>;
    this.reservationService.addReservation(entry);
    // Mark the selected seats as booked globally
    this.reservationService.bookSeats(seats);
    // Refresh seat statuses so newly reserved seats appear as booked
    this.applySeatStatuses();
    this.reservationComplete = true;
    // Clear selected seats and reset form values
    this.selectedSeats = [];
    this.formName = '';
    this.formPhone = '';
    this.formPackName = '';
    // hide success after 5 seconds
    setTimeout(() => {
      this.reservationComplete = false;
    }, 5000);
  }
}