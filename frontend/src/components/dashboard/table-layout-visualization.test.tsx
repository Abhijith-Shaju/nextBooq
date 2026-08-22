import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TableLayoutVisualization } from './table-layout-visualization';
import type { Table } from '@/lib/types/models';

const table = (overrides: Partial<Table> = {}): Table => ({
  id: overrides.id || 't1',
  cafe_id: 'cafe1',
  table_number: '1',
  capacity: 4,
  zone: 'indoor',
  floor: 1,
  status: 'active',
  ...overrides,
});

describe('TableLayoutVisualization', () => {
  test('renders nothing when there are no tables', () => {
    const { container } = render(<TableLayoutVisualization tables={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows a zone bubble label and the tables within it', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', zone: 'window' }),
          table({ id: 'b', table_number: '2', zone: 'window' }),
        ]}
      />
    );

    expect(screen.getByText('Window')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('does not show floor tabs when every table is on the same floor', () => {
    render(<TableLayoutVisualization tables={[table({ id: 'a', floor: 1 })]} />);

    expect(screen.queryByRole('button', { name: /floor 1/i })).not.toBeInTheDocument();
  });

  test('shows floor tabs when tables span more than one floor, and switching filters the tables shown', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: 'G1', floor: 1 }),
          table({ id: 'b', table_number: 'F2-1', floor: 2 }),
        ]}
      />
    );

    expect(screen.getByText('G1')).toBeInTheDocument();
    expect(screen.queryByText('F2-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /floor 2/i }));

    expect(screen.queryByText('G1')).not.toBeInTheDocument();
    expect(screen.getByText('F2-1')).toBeInTheDocument();
  });

  test('a table with no merge partners renders with no connector lines', () => {
    render(<TableLayoutVisualization tables={[table({ id: 'a' })]} />);

    expect(screen.getByTestId('table-layout-connectors').querySelectorAll('[data-testid="table-connector"]')).toHaveLength(0);
  });

  test('draws exactly one connector line for a symmetric merge pair, not two', () => {
    const partnerRef = { _id: 'b', table_number: '2' };
    const selfRef = { _id: 'a', table_number: '1' };
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', can_merge_with: [partnerRef] }),
          table({ id: 'b', table_number: '2', can_merge_with: [selfRef] }),
        ]}
      />
    );

    const svg = screen.getByTestId('table-layout-connectors');
    expect(svg.querySelectorAll('[data-testid="table-connector"]')).toHaveLength(1);
  });

  test('does not draw a line to a merge partner on a different floor', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', floor: 1, can_merge_with: [{ _id: 'b', table_number: '2' }] }),
          table({ id: 'b', table_number: '2', floor: 2, can_merge_with: [{ _id: 'a', table_number: '1' }] }),
        ]}
      />
    );

    // Only floor 1's table is rendered by default, so its partner isn't in
    // the current node set and no line can be drawn to it.
    const svg = screen.getByTestId('table-layout-connectors');
    expect(svg.querySelectorAll('[data-testid="table-connector"]')).toHaveLength(0);
  });

  test('draws connectors as curves, not straight lines — a straight line between distant tables would visually pass through every table in between', () => {
    const partnerRef = { _id: 'b', table_number: '2' };
    const selfRef = { _id: 'a', table_number: '1' };
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', can_merge_with: [partnerRef] }),
          table({ id: 'b', table_number: '2', can_merge_with: [selfRef] }),
        ]}
      />
    );

    const svg = screen.getByTestId('table-layout-connectors');
    expect(svg.querySelectorAll('line')).toHaveLength(0);
    const [connector] = svg.querySelectorAll('[data-testid="table-connector"]');
    // A quadratic Bezier ("Q") control point bows the connector away from
    // the straight line between its endpoints.
    expect(connector.getAttribute('d')).toMatch(/^M .* Q .* .*$/);
  });

  test('each connector is backed by a wider halo tracing the same path, so overlapping arcs stay distinguishable', () => {
    const partnerRef = { _id: 'b', table_number: '2' };
    const selfRef = { _id: 'a', table_number: '1' };
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', can_merge_with: [partnerRef] }),
          table({ id: 'b', table_number: '2', can_merge_with: [selfRef] }),
        ]}
      />
    );

    const svg = screen.getByTestId('table-layout-connectors');
    const allPaths = Array.from(svg.querySelectorAll<SVGPathElement>('path'));
    const connector = svg.querySelector<SVGPathElement>('[data-testid="table-connector"]')!;
    const halo = allPaths.find((p) => p !== connector);

    expect(halo).toBeDefined();
    // Same geometry, drawn first (underneath) and thicker.
    expect(halo!.getAttribute('d')).toBe(connector.getAttribute('d'));
    expect(Number(halo!.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(connector.getAttribute('stroke-width'))
    );
    expect(allPaths.indexOf(halo!)).toBeLessThan(allPaths.indexOf(connector));
  });
});
