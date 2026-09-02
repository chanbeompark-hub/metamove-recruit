import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('App', () => {
  it('renders the public home route and application link', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /움직임을 바꾸는 트레이너/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원서 작성하기' })).toHaveAttribute('href', '/apply');
    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getByLabelText('지원 안내')).toBeInTheDocument();
  });

  it('uses an application layout without a self-pointing fixed application action', () => {
    render(<MemoryRouter initialEntries={['/apply']}><App /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '기본 정보' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('지원 안내')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '지원하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '메타무브짐 홈' })).toHaveAttribute('href', '/');
  });

  it('keeps the future admin route outside the marketing and application layouts', () => {
    render(<MemoryRouter initialEntries={['/admin']}><App /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '주요 메뉴' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('지원 안내')).not.toBeInTheDocument();
  });
});
