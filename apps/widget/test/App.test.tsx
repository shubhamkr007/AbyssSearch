import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SearchApp } from '../src/App';
import { renderWidget } from './util';

describe('<enterprise-search> search flow', () => {
  it('renders the collapsed search bar with the disabled submit', () => {
    renderWidget(<SearchApp tabOverride={null} />, { placeholder: 'Search everything' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });

  it('runs a search on Enter and shows results + a search event', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'kubernetes');
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('link', { name: 'Kubernetes Production Runbook' }),
    ).toBeInTheDocument();
    expect(emit).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({ query: 'kubernetes', tab: 'all' }),
    );
  });

  it('shows suggestions and commits the picked one', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'kuber');

    const option = await screen.findByRole('option', {
      name: /Kubernetes Production Runbook/i,
    });
    await user.click(option);

    expect(
      await screen.findByRole('link', { name: 'Kubernetes Production Runbook' }),
    ).toBeInTheDocument();
    expect(emit).toHaveBeenCalledWith('suggestselect', {
      suggestion: 'Kubernetes Production Runbook',
    });
  });

  it('switches tabs and re-runs the search scoped to that source', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'acme');
    await user.keyboard('{Enter}');
    await screen.findByRole('link', { name: /record Q3 results/i });

    await user.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(emit).toHaveBeenCalledWith('tabchange', { tab: 'documents' });

    expect(
      await screen.findByRole('link', { name: /Information Security Policy/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /record Q3 results/i })).not.toBeInTheDocument(),
    );
  });

  it('filters results with a facet checkbox', async () => {
    const user = userEvent.setup();
    renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'policy');
    await user.keyboard('{Enter}');

    await screen.findByRole('link', { name: /Travel and Expense Policy/i });
    expect(screen.getByRole('link', { name: /Information Security Policy/i })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /^security/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: /Travel and Expense Policy/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Information Security Policy/i })).toBeInTheDocument();
  });

  it('offers a did-you-mean correction and applies it', async () => {
    const user = userEvent.setup();
    renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'kubernets');
    await user.keyboard('{Enter}');

    const correction = await screen.findByRole('button', { name: 'kubernetes' });
    await user.click(correction);

    expect(
      await screen.findByRole('link', { name: 'Kubernetes Production Runbook' }),
    ).toBeInTheDocument();
  });

  it('emits a resultclick event with the rank', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'kubernetes');
    await user.keyboard('{Enter}');

    const link = await screen.findByRole('link', { name: 'Kubernetes Production Runbook' });
    await user.click(link);
    expect(emit).toHaveBeenCalledWith(
      'resultclick',
      expect.objectContaining({ id: 'doc-k8s-runbook', rank: 1, tab: 'all' }),
    );
  });

  it('runs a trending search from the side rail', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'acme');
    await user.keyboard('{Enter}');

    const trending = await screen.findByRole('button', { name: 'kubernetes runbook' });
    await user.click(trending);
    expect(emit).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({ query: 'kubernetes runbook' }),
    );
    expect(
      await screen.findByRole('link', { name: 'Kubernetes Production Runbook' }),
    ).toBeInTheDocument();
  });

  it('shows "people also search" related queries', async () => {
    const user = userEvent.setup();
    renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'acme');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('People also search')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Acme launches new security platform/i }),
    ).toBeInTheDocument();
  });

  it('emits a human-in-the-loop feedback event', async () => {
    const user = userEvent.setup();
    const { emit } = renderWidget(<SearchApp tabOverride={null} />);
    await user.type(screen.getByRole('combobox'), 'acme');
    await user.keyboard('{Enter}');

    const button = await screen.findByRole('button', { name: 'Suggest better tags' });
    await user.click(button);
    expect(emit).toHaveBeenCalledWith('feedback', expect.objectContaining({ query: 'acme' }));
    expect(await screen.findByText(/Thanks/i)).toBeInTheDocument();
  });
});
