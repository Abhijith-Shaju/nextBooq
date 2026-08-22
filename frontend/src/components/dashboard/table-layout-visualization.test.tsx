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
    expect(screen.queryByRole('button', { name: /all floors/i })).not.toBeInTheDocument();
  });

  test('defaults to showing every floor at once, so a cross-floor merge is never hidden', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: 'G1', floor: 1 }),
          table({ id: 'b', table_number: 'F2-1', floor: 2 }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /all floors/i })).toBeInTheDocument();
    expect(screen.getByText('G1')).toBeInTheDocument();
    expect(screen.getByText('F2-1')).toBeInTheDocument();
  });

  test('selecting a single floor narrows to just that floor', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: 'G1', floor: 1 }),
          table({ id: 'b', table_number: 'F2-1', floor: 2 }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /floor 2/i }));

    expect(screen.queryByText('G1')).not.toBeInTheDocument();
    expect(screen.getByText('F2-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /all floors/i }));

    expect(screen.getByText('G1')).toBeInTheDocument();
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

  test('draws a connector for a merge that spans two floors', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', floor: 1, can_merge_with: [{ _id: 'b', table_number: '2' }] }),
          table({ id: 'b', table_number: '2', floor: 2, can_merge_with: [{ _id: 'a', table_number: '1' }] }),
        ]}
      />
    );

    // Merges are not confined to a floor — the booking engine merges purely
    // on can_merge_with adjacency — so the relationship has to be visible.
    const svg = screen.getByTestId('table-layout-connectors');
    expect(svg.querySelectorAll('[data-testid="table-connector"]')).toHaveLength(1);
  });

  test('draws a connector for a merge that spans two zones', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', zone: 'indoor', can_merge_with: [{ _id: 'b', table_number: '2' }] }),
          table({ id: 'b', table_number: '2', zone: 'outdoor', can_merge_with: [{ _id: 'a', table_number: '1' }] }),
        ]}
      />
    );

    expect(screen.getByText('Indoor')).toBeInTheDocument();
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
    const svg = screen.getByTestId('table-layout-connectors');
    expect(svg.querySelectorAll('[data-testid="table-connector"]')).toHaveLength(1);
  });

  test('drops a cross-floor connector when narrowed to one floor, since its partner is off screen', () => {
    render(
      <TableLayoutVisualization
        tables={[
          table({ id: 'a', table_number: '1', floor: 1, can_merge_with: [{ _id: 'b', table_number: '2' }] }),
          table({ id: 'b', table_number: '2', floor: 2, can_merge_with: [{ _id: 'a', table_number: '1' }] }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /floor 1/i }));

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
