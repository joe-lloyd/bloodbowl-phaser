const probe = new Uint16Array([1]);
const LITTLE_ENDIAN = new Uint8Array(probe.buffer, probe.byteOffset, probe.byteLength)[0] === 1;

export class NumberTable {
  private readonly values: Float64Array;
  private readonly view: DataView;

  private readonly columns: number;

  constructor(rows: number, columns: number) {
    this.columns = columns;
    this.values = new Float64Array(rows * columns);
    this.view = new DataView(this.values.buffer);
  }

  get(row: number, column: number): number {
    return this.view.getFloat64(
      (row * this.columns + column) * 8,
      LITTLE_ENDIAN
    );
  }

  set(row: number, column: number, value: number): void {
    this.view.setFloat64(
      (row * this.columns + column) * 8,
      value,
      LITTLE_ENDIAN
    );
  }

  fillRows(rows: number, value: number): void {
    this.values.fill(value, 0, rows * this.columns);
  }
}
