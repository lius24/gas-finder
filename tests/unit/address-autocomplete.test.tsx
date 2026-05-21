import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddressAutocomplete } from '@/components/AddressAutocomplete';

const { autocompleteMock } = vi.hoisted(() => ({ autocompleteMock: vi.fn() }));

vi.mock('@core/adapters/geocoding', () => ({
  autocompleteAddress: autocompleteMock,
}));

afterEach(() => {
  autocompleteMock.mockReset();
});

describe('AddressAutocomplete', () => {
  it('queries after typing and shows a results dropdown', async () => {
    autocompleteMock.mockResolvedValue([
      { id: 'a', label: 'Troy, New York', latitude: 42.7, longitude: -73.6 },
    ]);
    render(<AddressAutocomplete placeholder="Search" onSelect={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText('Search'), 'Troy');
    await waitFor(() => expect(autocompleteMock).toHaveBeenCalledWith('Troy'));
    expect(await screen.findByText('Troy, New York')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen suggestion', async () => {
    const suggestion = { id: 'a', label: 'Troy, New York', latitude: 42.7, longitude: -73.6 };
    autocompleteMock.mockResolvedValue([suggestion]);
    const onSelect = vi.fn();
    render(<AddressAutocomplete placeholder="Search" onSelect={onSelect} />);

    await userEvent.type(screen.getByPlaceholderText('Search'), 'Troy');
    await userEvent.click(await screen.findByText('Troy, New York'));
    expect(onSelect).toHaveBeenCalledWith(suggestion);
  });

  it('does not query for inputs shorter than 3 characters', async () => {
    render(<AddressAutocomplete placeholder="Search" onSelect={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search'), 'ab');
    await new Promise((r) => setTimeout(r, 400));
    expect(autocompleteMock).not.toHaveBeenCalled();
  });
});
