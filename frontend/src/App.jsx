import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Activity, ArrowUpRight, Bell, CalendarDays, ChartNoAxesCombined,
  ChevronDown, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun,
  Database, Download, Droplets, Gauge, LayoutDashboard, MapPinned, Menu, Moon, Search,
  Send, Settings2, ShieldAlert, Sun, Thermometer, Wind, X,
} from 'lucide-react'
import './App.css'

const DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram', 'Kanniyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
  'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga',
  'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
  'Viluppuram', 'Virudhunagar',
]

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/districts', label: 'District weather', icon: MapPinned },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/assistant', label: 'WeatherGPT', icon: Activity },
  { to: '/forecast', label: 'Forecast', icon: CalendarDays },
  { to: '/history', label: 'Historical data', icon: Database },
  { to: '/alerts', label: 'Alerts & warnings', icon: ShieldAlert },
  { to: '/about', label: 'About', icon: Settings2 },
]

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const DistrictLocator = lazy(() => import('./components/DistrictLocator.jsx'))
const WeatherCharts = lazy(() => import('./components/WeatherCharts.jsx'))

function weatherLabel(code = 0) {
  if (code === 0) return 'Clear sky'
  if ([1, 2].includes(code)) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if ([45, 48].includes(code)) return 'Foggy'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain showers'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snowfall'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Current conditions'
}

function localDateLabel(timestamp) {
  if (!timestamp) return 'TAMIL NADU'
  const [year, month, day] = timestamp.slice(0, 10).split('-').map(Number)
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthOffsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const adjustedYear = month < 3 ? year - 1 : year
  const weekday = (adjustedYear + Math.floor(adjustedYear / 4) - Math.floor(adjustedYear / 100) + Math.floor(adjustedYear / 400) + monthOffsets[month - 1] + day) % 7
  return `${weekdayNames[weekday]}, ${String(day).padStart(2, '0')} ${monthNames[month - 1]} ${year}`.toUpperCase()
}

function WeatherIcon({ code = 1, size = 24 }) {
  const Icon = code === 0 ? Sun
    : [1, 2].includes(code) ? CloudSun
      : code === 3 ? Cloud
        : [45, 48].includes(code) ? CloudFog
          : [51, 53, 55, 56, 57].includes(code) ? CloudDrizzle
            : [95, 96, 99].includes(code) ? CloudLightning
              : CloudRain
  return <Icon size={size} strokeWidth={1.6} />
}

function formatTime(value, options = { hour: 'numeric', minute: '2-digit' }) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

function formatDay(value, index) {
  if (index === 0) return 'Today'
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`))
}

function AppShell() {
  const [district, setDistrict] = useState('Coimbatore')
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('weathergpt-theme') ?? 'dark')
  const [mobileNav, setMobileNav] = useState(false)
  const [search, setSearch] = useState('')
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('weathergpt-theme', theme)
  }, [theme])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/weather?district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather service returned ${response.status}`)
        return response.json()
      })
      .then((data) => setWeather(data))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message || 'Could not load weather data')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [district, refreshKey])

  const page = NAV_ITEMS.find((item) => item.to === location.pathname)

  function chooseDistrict(nextDistrict) {
    setLoading(true)
    setError('')
    setWeather(null)
    setDistrict(nextDistrict)
    setMobileNav(false)
  }

  function refreshWeather() {
    setLoading(true)
    setError('')
    setRefreshKey((current) => current + 1)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><CloudSun size={21} /></div>
          <div><strong>weather<span>gpt</span></strong><small>TAMIL NADU INTELLIGENCE</small></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <NavLink to="/districts" className="workspace-chip" onClick={() => setMobileNav(false)}><span className="status-dot" /> Live weather workspace <ChevronDown size={14} /></NavLink>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileNav(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {to === '/alerts' && <span className="nav-count">0</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-card"><div className="source-icon"><Activity size={17} /></div><div><strong>Data source</strong><span>Open-Meteo API</span></div><span className="source-live">LIVE</span></div>
          <div className="profile-row"><div className="profile-avatar">TN</div><div className="profile-copy"><strong>Tamil Nadu</strong><span>Regional workspace</span></div><Settings2 size={17} className="profile-settings" /></div>
        </div>
      </aside>

      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>WeatherGPT</span><span className="crumb-slash">/</span><strong>{page?.label ?? 'Overview'}</strong></div>
          <div className="topbar-actions">
            <label className="district-select-wrap"><MapPinned size={15} /><select aria-label="Choose district" value={district} onChange={(event) => chooseDistrict(event.target.value)}>{DISTRICTS.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={14} /></label>
            <button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <NavLink to="/alerts" className="icon-button notification-button" aria-label="View alerts"><Bell size={17} /></NavLink>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>Weather data is unavailable: {error}</span><button className="text-button" onClick={refreshWeather}>Retry</button></div>}
          <Routes>
            <Route path="/" element={<Dashboard district={district} weather={weather} loading={loading} onDistrictChange={chooseDistrict} />} />
            <Route path="/districts" element={<DistrictPage district={district} weather={weather} onDistrictChange={chooseDistrict} search={search} setSearch={setSearch} />} />
            <Route path="/analytics" element={<AnalyticsPage district={district} weather={weather} onDistrictChange={chooseDistrict} />} />
            <Route path="/assistant" element={<AssistantPage district={district} />} />
            <Route path="/forecast" element={<ForecastPage weather={weather} loading={loading} district={district} />} />
            <Route path="/history" element={<HistoryPage district={district} />} />
            <Route path="/alerts" element={<UnavailablePage icon={ShieldAlert} eyebrow="OFFICIAL MONITORING" title="Alerts & warnings" message="No verified IMD alert feed is connected. Official warnings will appear here only after an authoritative source is configured." />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
          <footer className="page-footer"><span>WeatherGPT · Tamil Nadu</span><span>Observations and forecasts by Open-Meteo</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Source details ↗</a></footer>
        </div>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>
}

function Dashboard({ district, weather, loading, onDistrictChange }) {
  const todayLabel = localDateLabel(weather?.observed_at)
  const localHour = Number(weather?.observed_at?.slice(11, 13) ?? 9)
  const greeting = localHour < 12 ? 'Good morning' : localHour < 17 ? 'Good afternoon' : 'Good evening'
  const hourlyData = useMemo(() => {
    if (!weather?.hourly) return []
    const times = weather.hourly.time ?? []
    const currentHour = Number(weather.observed_at?.slice(11, 13) ?? 0)
    return times.map((time, index) => ({
      time: formatTime(time, { hour: 'numeric', timeZone: 'Asia/Kolkata' }),
      temperature: weather.hourly.temperature_2m?.[index],
      rain: weather.hourly.precipitation_probability?.[index],
      index,
    })).filter((item) => item.index >= currentHour && item.index < currentHour + 24)
  }, [weather])

  const daily = weather?.daily?.time?.slice(0, 7).map((date, index) => ({
    date, day: formatDay(date, index), code: weather.daily.weather_code[index],
    high: Math.round(weather.daily.temperature_2m_max[index]),
    low: Math.round(weather.daily.temperature_2m_min[index]),
    rain: weather.daily.precipitation_sum[index],
  })) ?? []

  return (
    <>
      <PageHeading eyebrow={`${todayLabel} · TAMIL NADU`} title={greeting} description="A clearer view of the weather around you." action={<div className="updated-label"><span className="status-dot" />{weather?.observed_at ? `Updated ${formatTime(weather.observed_at)}` : 'Connecting to live data'}</div>} />
      <section className="overview-grid">
        <article className="current-card panel">
          <div className="current-card-top"><div><p className="card-kicker"><span className="live-dot" /> CURRENT CONDITIONS</p><h2>{district}<span>, Tamil Nadu</span></h2></div><div className="current-icon"><WeatherIcon code={weather?.weather_code} size={38} /></div></div>
          {loading && !weather ? <div className="skeleton-temperature" /> : <div className="temperature-line"><span>{weather?.temperature != null ? Math.round(weather.temperature) : '--'}°</span><div><strong>{weatherLabel(weather?.weather_code)}</strong><small>Feels like {weather?.feels_like != null ? `${Math.round(weather.feels_like)}°` : '--'}</small></div></div>}
          <div className="current-card-bottom"><span><MapPinned size={14} /> {weather?.latitude?.toFixed(2) ?? '—'}° N, {weather?.longitude?.toFixed(2) ?? '—'}° E</span><span>Local time · IST</span></div>
        </article>
        <article className="summary-card panel"><div className="summary-heading"><div><p className="card-kicker">TODAY'S OUTLOOK</p><h3>{weatherLabel(weather?.weather_code)} across {district}</h3></div><WeatherIcon code={weather?.weather_code} size={27} /></div><p className="summary-copy">{weather?.daily ? `Temperatures near ${Math.round(weather.daily.temperature_2m_max?.[0] ?? 0)}° today, with ${weather.daily.precipitation_sum?.[0] ?? 0} mm of forecast rainfall.` : 'Live observations and forecast summary will appear when the weather service responds.'}</p><div className="summary-source"><span className="source-check">✓</span> Open-Meteo · {weather?.observed_at ? formatTime(weather.observed_at) : 'Awaiting observation'}</div></article>
      </section>

      <section className="metric-grid" aria-label="Current weather measurements">
        <MetricCard icon={Droplets} label="Humidity" value={weather?.humidity} unit="%" tone="blue" caption="Relative humidity" />
        <MetricCard icon={CloudRain} label="Rainfall" value={weather?.rainfall} unit="mm" tone="cyan" caption="Current precipitation" />
        <MetricCard icon={Wind} label="Wind speed" value={weather?.wind_speed} unit="km/h" tone="mint" caption={`${weather?.wind_direction ?? '—'}° direction`} />
        <MetricCard icon={Gauge} label="Pressure" value={weather?.pressure} unit="hPa" tone="amber" caption={`${weather?.cloud_cover ?? '—'}% cloud cover`} />
      </section>

      <section className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><p className="card-kicker">NEXT 24 HOURS</p><h3>Hourly temperature outlook</h3></div><span className="chart-legend"><i /> Temperature °C</span></div>
          {hourlyData.length ? <div className="chart-wrap"><Suspense fallback={<ChartEmpty loading />}><WeatherCharts data={hourlyData} /></Suspense></div> : <ChartEmpty loading={loading} />}
          <div className="chart-footnote">Precipitation probability is available in the hourly forecast data.</div>
        </article>
        <article className="panel conditions-panel"><div className="panel-heading"><div><p className="card-kicker">AT A GLANCE</p><h3>Atmospheric details</h3></div></div><ConditionRow icon={Thermometer} label="Feels like" value={weather?.feels_like != null ? `${Math.round(weather.feels_like)}°C` : '—'} /><ConditionRow icon={Cloud} label="Cloud cover" value={weather?.cloud_cover != null ? `${weather.cloud_cover}%` : '—'} /><ConditionRow icon={Sun} label="Sunrise" value={weather?.sunrise ? formatTime(weather.sunrise) : '—'} /><ConditionRow icon={Moon} label="Sunset" value={weather?.sunset ? formatTime(weather.sunset) : '—'} /><p className="data-footnote">Current measurements are observations. Daily values are third-party forecasts.</p></article>
      </section>

      <section className="panel forecast-panel"><div className="panel-heading"><div><p className="card-kicker">LOOKING AHEAD</p><h3>7-day forecast</h3></div><NavLink className="subtle-link" to="/forecast">Full forecast <ArrowUpRight size={14} /></NavLink></div>
        {daily.length ? <div className="forecast-strip">{daily.map((day) => <div className="forecast-day" key={day.date}><span>{day.day}</span><WeatherIcon code={day.code} size={23} /><strong>{day.high}° <small>{day.low}°</small></strong><em>{day.rain} mm</em></div>)}</div> : <ChartEmpty loading={loading} />}
      </section>

      <section className="bottom-grid"><article className="panel district-panel"><div className="panel-heading"><div><p className="card-kicker">REGIONAL COVERAGE</p><h3>Tamil Nadu districts</h3></div><NavLink className="subtle-link" to="/districts">Explore all 38 <ArrowUpRight size={14} /></NavLink></div><div className="district-feature"><div className="district-map-mark"><MapPinned size={21} /></div><div><strong>{district}</strong><span>Selected district · weather loaded live</span></div><span className="temperature-pill">{weather?.temperature != null ? `${Math.round(weather.temperature)}°` : '—'}</span></div><DistrictQuickList selected={district} onSelect={onDistrictChange} /></article>
        <article className="panel source-panel"><div className="source-panel-icon"><Activity size={19} /></div><p className="card-kicker">DATA PROVENANCE</p><h3>Built on live weather data</h3><p>Current conditions and forecast values are fetched from Open-Meteo for the selected district.</p><div className="source-status"><span className="status-dot" /> API connected <span>·</span> No synthetic readings</div><a className="subtle-link" href="https://open-meteo.com/" target="_blank" rel="noreferrer">About the source <ArrowUpRight size={14} /></a></article>
      </section>
    </>
  )
}

function MetricCard({ icon: Icon, label, value, unit, tone, caption }) {
  return <article className="metric-card panel"><div className={`metric-icon metric-icon--${tone}`}><Icon size={17} /></div><span className="metric-label">{label}</span><strong>{value == null ? '—' : Number(value).toFixed(label === 'Rainfall' ? 1 : 0)}<small>{unit}</small></strong><span className="metric-caption">{caption}</span></article>
}

function ConditionRow({ icon: Icon, label, value }) {
  return <div className="condition-row"><span className="condition-name"><Icon size={15} />{label}</span><strong>{value}</strong></div>
}

function ChartEmpty({ loading }) {
  return <div className="chart-empty">{loading ? <><span className="loading-ring" /> Loading live forecast…</> : 'Forecast data is not available right now.'}</div>
}

function DistrictQuickList({ selected, onSelect }) {
  const popular = ['Chennai', 'Madurai', 'Salem', 'Nilgiris', 'Tirunelveli', 'Thanjavur']
  return <div className="quick-districts">{popular.map((name) => <button key={name} className={`district-chip ${selected === name ? 'district-chip--active' : ''}`} onClick={() => onSelect(name)}>{name}</button>)}</div>
}

function DistrictPage({ district, weather, onDistrictChange, search, setSearch }) {
  const [boundaryData, setBoundaryData] = useState(null)
  const [boundaryError, setBoundaryError] = useState('')
  const filtered = DISTRICTS.filter((name) => name.toLowerCase().includes(search.toLowerCase()))
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/boundaries`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('District boundaries unavailable')))
      .then((data) => {
        if (data.features?.length !== 38) throw new Error('Expected 38 district boundaries')
        setBoundaryData(data)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setBoundaryError(error.message)
      })
    return () => controller.abort()
  }, [])
  return <><PageHeading eyebrow="REGIONAL WEATHER" title="District weather" description="Explore live conditions across all 38 districts of Tamil Nadu." action={<span className="data-badge"><span className="status-dot" /> LIVE API</span>} />
    <section className="district-layout"><div className="district-sidebar-stack"><article className="panel selected-district-panel"><p className="card-kicker">SELECTED DISTRICT</p><div className="selected-district-title"><div><h2>{district}</h2><p>{weatherLabel(weather?.weather_code)} · Open-Meteo</p></div><WeatherIcon code={weather?.weather_code} size={35} /></div><div className="selected-district-temperature">{weather?.temperature != null ? `${Math.round(weather.temperature)}°` : '—'}<small>C</small></div><div className="selected-stats"><span><Droplets size={14} />Humidity <strong>{weather?.humidity ?? '—'}%</strong></span><span><CloudRain size={14} />Rain <strong>{weather?.rainfall ?? '—'} mm</strong></span><span><Wind size={14} />Wind <strong>{weather?.wind_speed ?? '—'} km/h</strong></span></div><div className="coordinates-note">{weather?.latitude?.toFixed(3) ?? '—'}° N · {weather?.longitude?.toFixed(3) ?? '—'}° E</div></article><Suspense fallback={<div className="panel map-message"><span className="loading-ring" /> Loading district map…</div>}><DistrictLocator data={boundaryData} selected={district} onSelect={onDistrictChange} loading={!boundaryData && !boundaryError} error={boundaryError} /></Suspense></div>
      <article className="panel district-directory"><div className="panel-heading"><div><p className="card-kicker">DISTRICT DIRECTORY</p><h3>Choose a district</h3></div><span className="district-total">{filtered.length} / 38</span></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search districts…" /><kbd>⌘ K</kbd></label><div className="district-grid">{filtered.map((name, index) => <button key={name} className={`district-option ${district === name ? 'district-option--active' : ''}`} onClick={() => onDistrictChange(name)}><span className="district-index">{String(index + 1).padStart(2, '0')}</span><span>{name}</span>{district === name && <span className="option-active-dot" />}</button>)}</div><p className="directory-note">Select a district to fetch its live conditions. Unselected districts are not populated with estimates.</p></article></section>
    <DistrictComparison district={district} weather={weather} />
    <div className="notice-row"><MapPinned size={17} /><div><strong>Boundary source</strong><span>{boundaryData?.source?.name ?? 'geoBoundaries'} · India ADM2 · {boundaryData?.source?.boundaryYearRepresented ?? '2021'} · ODbL 1.0. Representative weather points are derived from each polygon.</span></div></div>
  </>
}

function DistrictComparison({ district, weather }) {
  const [otherDistrict, setOtherDistrict] = useState(district === 'Madurai' ? 'Chennai' : 'Madurai')
  const [comparison, setComparison] = useState(null)
  const compareWith = otherDistrict === district
    ? district === 'Madurai' ? 'Chennai' : 'Madurai'
    : otherDistrict

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/weather?district=${encodeURIComponent(compareWith)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Comparison weather unavailable')
        return response.json()
      })
      .then((data) => setComparison({ district: compareWith, data, error: '' }))
      .catch((error) => {
        if (error.name !== 'AbortError') setComparison({ district: compareWith, data: null, error: error.message })
      })
    return () => controller.abort()
  }, [compareWith])

  const otherWeather = comparison?.district === compareWith ? comparison.data : null
  const rows = [
    { label: 'Temperature', left: weather?.temperature, right: otherWeather?.temperature, unit: '°C' },
    { label: 'Humidity', left: weather?.humidity, right: otherWeather?.humidity, unit: '%' },
    { label: 'Rainfall', left: weather?.rainfall, right: otherWeather?.rainfall, unit: ' mm' },
    { label: 'Wind speed', left: weather?.wind_speed, right: otherWeather?.wind_speed, unit: ' km/h' },
  ]

  return <section className="panel comparison-panel"><div className="panel-heading"><div><p className="card-kicker">LIVE DISTRICT COMPARISON</p><h3>Compare current conditions</h3></div><label className="select-control"><span>Compare with</span><select value={compareWith} onChange={(event) => setOtherDistrict(event.target.value)}>{DISTRICTS.filter((name) => name !== district).map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={14} /></label></div>
    <div className="comparison-table"><div className="comparison-head"><span>MEASUREMENT</span><strong>{district}</strong><strong>{compareWith}</strong></div>{rows.map((row) => <div className="comparison-row" key={row.label}><span>{row.label}</span><strong>{row.left == null ? '—' : `${Number(row.left).toFixed(row.unit === ' mm' ? 1 : 0)}${row.unit}`}</strong><strong>{row.right == null ? (comparison?.district === compareWith && comparison?.error ? 'Unavailable' : 'Loading…') : `${Number(row.right).toFixed(row.unit === ' mm' ? 1 : 0)}${row.unit}`}</strong></div>)}</div>
    <p className="comparison-note">Live observations · Open-Meteo · Values fetched for each district separately</p>
  </section>
}

function AnalyticsPage({ district, weather, onDistrictChange }) {
  const daily = weather?.daily?.time?.map((date, index) => ({
    date: formatDay(date, index), high: weather.daily.temperature_2m_max[index],
    low: weather.daily.temperature_2m_min[index], rain: weather.daily.precipitation_sum[index],
  })) ?? []
  const [metric, setMetric] = useState('temperature')
  const [comparison, setComparison] = useState(null)
  const [comparisonError, setComparisonError] = useState('')
  const [forecastMetric, setForecastMetric] = useState('temperature')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/weather/comparison`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Comparison service returned ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (data.districts?.length !== 38) throw new Error('Expected live weather for 38 districts')
        setComparison(data)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setComparisonError(error.message)
      })
    return () => controller.abort()
  }, [])
  const chartData = comparison?.districts
    ?.map((item) => ({ district: item.district, value: item[metric] }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => right.value - left.value) ?? []
  const observedAt = comparison?.districts?.[0]?.observed_at

  return <><PageHeading eyebrow="WEATHER INTELLIGENCE" title="Analytics" description="Compare live conditions and forecast trends across Tamil Nadu." action={<label className="select-control"><span>Selected district</span><select value={district} onChange={(event) => onDistrictChange(event.target.value)}>{DISTRICTS.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={14} /></label>} />
    <section className="panel analytics-panel"><div className="panel-heading"><div><p className="card-kicker">LIVE OBSERVATIONS · {comparison?.source?.toUpperCase() ?? 'OPEN-METEO'}</p><h3>{metric === 'temperature' ? 'Temperature by district' : metric === 'humidity' ? 'Humidity by district' : metric === 'rainfall' ? 'Current rainfall by district' : 'Wind speed by district'}</h3></div><label className="select-control"><span>Measure</span><select value={metric} onChange={(event) => setMetric(event.target.value)}><option value="temperature">Temperature</option><option value="rainfall">Rainfall</option><option value="humidity">Humidity</option><option value="wind_speed">Wind speed</option></select><ChevronDown size={14} /></label></div>
      {chartData.length ? <div className="analytics-chart analytics-chart--districts"><Suspense fallback={<ChartEmpty loading />}><WeatherCharts data={chartData} variant="comparison" metric={metric} selectedDistrict={district} /></Suspense></div> : comparisonError ? <div className="chart-empty" role="alert">Live district comparison unavailable: {comparisonError}</div> : <ChartEmpty loading />}
      <div className="chart-disclaimer">Live point observations · {observedAt ? formatTime(observedAt) : 'Loading observation time'} IST · Bar highlights the selected district</div></section>
    <section className="panel analytics-panel"><div className="panel-heading"><div><p className="card-kicker">7-DAY THIRD-PARTY FORECAST · {district.toUpperCase()}</p><h3>Daily temperature and rainfall</h3></div><label className="select-control"><span>Measure</span><select value={forecastMetric} onChange={(event) => setForecastMetric(event.target.value)}><option value="temperature">Temperature</option><option value="rain">Rainfall</option></select><ChevronDown size={14} /></label></div>
      {daily.length ? <div className="analytics-chart analytics-chart--forecast"><Suspense fallback={<ChartEmpty loading />}><WeatherCharts data={daily} variant="analytics" metric={forecastMetric} /></Suspense></div> : <ChartEmpty loading={!weather} />}
      <div className="chart-disclaimer">Forecast output, not historical observations or an ML prediction</div></section>
    <section className="metric-grid analytics-metrics"><MetricCard icon={Thermometer} label="Today's high" value={weather?.daily?.temperature_2m_max?.[0]} unit="°C" tone="blue" caption="Forecast maximum" /><MetricCard icon={Thermometer} label="Today's low" value={weather?.daily?.temperature_2m_min?.[0]} unit="°C" tone="mint" caption="Forecast minimum" /><MetricCard icon={CloudRain} label="7-day rainfall" value={daily.reduce((total, day) => total + (day.rain ?? 0), 0)} unit="mm" tone="cyan" caption="Forecast total" /><MetricCard icon={Wind} label="Wind speed" value={weather?.wind_speed} unit="km/h" tone="amber" caption="Current observation" /></section>
  </>
}

function ForecastPage({ weather, loading, district }) {
  const daily = weather?.daily?.time?.map((date, index) => ({ date, day: formatDay(date, index), code: weather.daily.weather_code[index], high: Math.round(weather.daily.temperature_2m_max[index]), low: Math.round(weather.daily.temperature_2m_min[index]), rain: weather.daily.precipitation_sum[index] })) ?? []
  return <><PageHeading eyebrow="THIRD-PARTY FORECAST" title="7-day forecast" description={`A district-level outlook for ${district}, from Open-Meteo.`} action={<span className="data-badge">FORECAST · NOT ML</span>} />
    <section className="forecast-list panel">{daily.length ? daily.map((day) => <div className="forecast-row" key={day.date}><span className="forecast-weekday">{day.day}<small>{new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${day.date}T12:00:00+05:30`))}</small></span><div className="forecast-condition"><WeatherIcon code={day.code} size={22} /><span>{weatherLabel(day.code)}</span></div><span className="rain-chance"><CloudRain size={14} />{day.rain} mm</span><span className="forecast-range"><strong>{day.high}°</strong><i><b style={{ left: `${Math.min(Math.max((day.low + 5) * 2, 4), 85)}%`, width: '35%' }} /></i><span>{day.low}°</span></span></div>) : <ChartEmpty loading={loading} />}</section>
    <div className="notice-row"><Activity size={17} /><div><strong>Forecast provenance</strong><span>Values shown are third-party forecast output. They are not verified observations, ML predictions, or official warnings.</span></div></div>
  </>
}

function AssistantPage({ district = 'Coimbatore' }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const suggestions = ['Will it rain in Chennai tomorrow?', 'How humid is Coimbatore right now?', 'What is the wind in Madurai today?']

  async function submitQuestion(event) {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || loading) return

    const userQuestion = trimmed
    setMessages((items) => [...items, { question: userQuestion, answer: 'Thinking…', isLoading: true }])
    setQuestion('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion, district }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Assistant request failed')

      setMessages((items) => items.map((item) => item.question === userQuestion && item.isLoading
        ? { ...item, answer: result.answer, isLoading: false }
        : item))
    } catch (error) {
      setMessages((items) => items.map((item) => item.question === userQuestion && item.isLoading
        ? { ...item, answer: error.message || 'The assistant could not answer that question right now.', isLoading: false }
        : item))
    } finally {
      setLoading(false)
    }
  }

  return <><PageHeading eyebrow="WEATHERGPT ASSISTANT" title="Ask the weather" description="A live weather assistant using current Tamil Nadu conditions." action={<span className="data-badge">AI CONNECTED</span>} />
    <section className="chat-workspace panel"><div className="chat-header"><div className="assistant-avatar"><CloudSun size={21} /></div><div><strong>WeatherGPT</strong><span>Weather retrieval · live assistant</span></div><span className="offline-indicator"><i /> Connected</span></div><div className={`chat-body${messages.length ? ' chat-body--conversation' : ''}`}>{messages.length === 0 ? <div className="chat-empty"><div className="chat-sparkle"><CloudSun size={28} /></div><h2>Weather answers, with sources.</h2><p>Ask about the current weather, rain, humidity, or wind. The assistant replies using live Open-Meteo data for Tamil Nadu districts.</p><div className="suggestion-list">{suggestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}<ArrowUpRight size={14} /></button>)}</div></div> : messages.map((message, index) => <div className="conversation-pair" key={`${message.question}-${index}`}><div className="user-message">{message.question}</div><div className="assistant-message"><div className="assistant-avatar assistant-avatar--small"><CloudSun size={15} /></div><p>{message.answer}</p></div></div>)}</div><form className="chat-composer" onSubmit={submitQuestion}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about Tamil Nadu weather…" aria-label="Your weather question" /><button aria-label="Send question" type="submit" disabled={!question.trim() || loading}><Send size={17} /></button></form><p className="chat-footnote">Live data is used for local answers; if an OpenAI key is configured, the assistant can use it as a richer response layer.</p></section>
  </>
}

function HistoryPage({ district }) {
  const archiveDate = new Date()
  archiveDate.setDate(archiveDate.getDate() - 5)
  const archiveAvailableThrough = `${archiveDate.getFullYear()}-${String(archiveDate.getMonth() + 1).padStart(2, '0')}-${String(archiveDate.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState(`${new Date().getFullYear() - 5}-01-01`)
  const [endDate, setEndDate] = useState(archiveAvailableThrough)
  const [records, setRecords] = useState([])
  const [comparison, setComparison] = useState([])
  const [accuracy, setAccuracy] = useState(null)
  const [mlForecast, setMlForecast] = useState(null)
  const [metric, setMetric] = useState('temperature')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState('')
  const [error, setError] = useState('')
  const [accuracyError, setAccuracyError] = useState('')
  const [mlForecastError, setMlForecastError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!startDate || !endDate) return undefined
    const controller = new AbortController()
    const params = new URLSearchParams({ district, start_date: startDate, end_date: endDate })
    setLoading(true)
    fetch(`${API_BASE}/api/history?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || 'Could not load historical records')
        return result
      })
      .then((result) => {
        setRecords(result.records ?? [])
        setError('')
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [district, startDate, endDate, reloadKey])

  useEffect(() => {
    if (!startDate || !endDate) return undefined
    const controller = new AbortController()
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    fetch(`${API_BASE}/api/history/comparison?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('District comparison unavailable')))
      .then((result) => setComparison(result.districts ?? []))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setComparison([])
      })
    return () => controller.abort()
  }, [startDate, endDate, reloadKey])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/history/forecast-accuracy?district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Forecast evaluation unavailable')))
      .then((result) => {
        setAccuracy(result)
        setAccuracyError('')
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setAccuracyError(fetchError.message)
      })
    return () => controller.abort()
  }, [district])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/api/history/ml-forecast?district=${encodeURIComponent(district)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || 'ML forecast unavailable')
        return result
      })
      .then((result) => {
        setMlForecast(result)
        setMlForecastError('')
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setMlForecastError(fetchError.message)
      })
    return () => controller.abort()
  }, [district, reloadKey])

  async function syncHistory(targetDistrict) {
    if (!startDate || !endDate || startDate > endDate) {
      setError('Choose a valid date range before syncing.')
      return
    }
    setSyncing(targetDistrict)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`${API_BASE}/api/history/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ district: targetDistrict, start_date: startDate, end_date: endDate }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Historical sync failed')
      setNotice(`Stored ${result.rows_upserted.toLocaleString()} daily records from Open-Meteo.`)
      setReloadKey((key) => key + 1)
    } catch (syncError) {
      setError(syncError.message || 'Historical sync failed')
    } finally {
      setSyncing('')
    }
  }

  const monthGroups = new Map()
  const yearGroups = new Map()
  const seasonGroups = new Map()
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const seasons = { 'Winter': [1, 2], 'Summer': [3, 4, 5], 'Southwest monsoon': [6, 7, 8, 9], 'Northeast monsoon': [10, 11, 12] }
  for (const record of records) {
    const [year, month] = record.observed_on.split('-').map(Number)
    const monthKey = record.observed_on.slice(0, 7)
    const monthGroup = monthGroups.get(monthKey) ?? { date: monthKey, high: [], low: [], humidity: [], rain: 0 }
    if (record.temperature_max != null) monthGroup.high.push(record.temperature_max)
    if (record.temperature_min != null) monthGroup.low.push(record.temperature_min)
    if (record.relative_humidity_mean != null) monthGroup.humidity.push(record.relative_humidity_mean)
    monthGroup.rain += record.precipitation_sum ?? 0
    monthGroups.set(monthKey, monthGroup)

    const yearGroup = yearGroups.get(year) ?? { year, temperatures: [], humidity: [], rain: 0, days: 0 }
    if (record.temperature_mean != null) yearGroup.temperatures.push(record.temperature_mean)
    if (record.relative_humidity_mean != null) yearGroup.humidity.push(record.relative_humidity_mean)
    yearGroup.rain += record.precipitation_sum ?? 0
    yearGroup.days += 1
    yearGroups.set(year, yearGroup)

    const season = Object.keys(seasons).find((name) => seasons[name].includes(month))
    const seasonGroup = seasonGroups.get(season) ?? { name: season, temperatures: [], humidity: [], rain: 0, days: 0 }
    if (record.temperature_mean != null) seasonGroup.temperatures.push(record.temperature_mean)
    if (record.relative_humidity_mean != null) seasonGroup.humidity.push(record.relative_humidity_mean)
    seasonGroup.rain += record.precipitation_sum ?? 0
    seasonGroup.days += 1
    seasonGroups.set(season, seasonGroup)
  }
  const average = (values) => {
    const validValues = values.filter(Number.isFinite)
    return validValues.length ? validValues.reduce((total, value) => total + value, 0) / validValues.length : null
  }
  const monthly = [...monthGroups.values()].sort((left, right) => left.date.localeCompare(right.date)).map((group) => ({
    date: `${monthNames[Number(group.date.slice(5, 7)) - 1]} ${group.date.slice(0, 4)}`,
    high: average(group.high), low: average(group.low), humidity: average(group.humidity), rain: group.rain,
  }))
  const yearly = [...yearGroups.values()].sort((left, right) => left.year - right.year)
  const seasonal = [...seasonGroups.values()]
  const anomalyGroups = new Map()
  for (const record of records) {
    const month = Number(record.observed_on.slice(5, 7))
    const values = anomalyGroups.get(month) ?? { temperatures: [], rainfall: [] }
    if (record.temperature_max != null) values.temperatures.push(record.temperature_max)
    if (record.precipitation_sum != null) values.rainfall.push(record.precipitation_sum)
    anomalyGroups.set(month, values)
  }
  const anomalies = []
  for (const record of records) {
    const month = Number(record.observed_on.slice(5, 7))
    const baseline = anomalyGroups.get(month)
    if (!baseline || baseline.temperatures.length < 60) continue
    const averageHigh = average(baseline.temperatures)
    const highDeviation = Math.sqrt(average(baseline.temperatures.map((value) => (value - averageHigh) ** 2)))
    const rainfallSorted = [...baseline.rainfall].sort((left, right) => left - right)
    const rainfallThreshold = Math.max(5, rainfallSorted[Math.floor(rainfallSorted.length * 0.95)] ?? 0)
    if (record.temperature_max != null && record.temperature_max > averageHigh + 2.5 * highDeviation && record.temperature_max - averageHigh >= 2) {
      anomalies.push({ date: record.observed_on, label: 'Unusually hot', value: `${record.temperature_max.toFixed(1)}°C`, tone: 'amber' })
    }
    if (record.precipitation_sum != null && record.precipitation_sum > rainfallThreshold) {
      anomalies.push({ date: record.observed_on, label: 'Heavy rainfall', value: `${record.precipitation_sum.toFixed(1)} mm`, tone: 'blue' })
    }
  }
  anomalies.sort((left, right) => right.date.localeCompare(left.date))
  const trainingParams = new URLSearchParams({ district, start_date: startDate, end_date: endDate })
  const comparisonRows = [...comparison].sort((left, right) => (right.rainfall_total ?? 0) - (left.rainfall_total ?? 0))

  return <>
    <PageHeading eyebrow="HISTORICAL WEATHER · ERA5" title="Weather history" description="Reanalysis records for trends, comparisons, anomalies, and forecast evaluation." action={<span className="data-badge">{records.length.toLocaleString()} DAYS</span>} />
    <section className="history-controls panel">
      <label>From<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>Through<input type="date" value={endDate} min={startDate} max={archiveAvailableThrough} onChange={(event) => setEndDate(event.target.value)} /></label>
      <button className="history-action" onClick={() => syncHistory(district)} disabled={Boolean(syncing)}><Database size={15} />{syncing === district ? 'Syncing…' : `Sync ${district}`}</button>
      <button className="history-action history-action--secondary" onClick={() => syncHistory('all')} disabled={Boolean(syncing)}><Download size={15} />{syncing === 'all' ? 'Syncing 38…' : 'Sync all districts'}</button>
      <a className="history-action history-action--export" href={`${API_BASE}/api/history/training-data.csv?${trainingParams}`}><Download size={15} />Training CSV</a>
    </section>
    {syncing === 'all' && <div className="history-notice history-sync-status" role="status">Fetching archive data for all 38 districts concurrently. The first large sync can take a little while; keep this page open.</div>}
    {error && <div className="history-alert" role="alert"><strong>{error.toLowerCase().includes('database unavailable') ? 'Database unavailable' : 'Historical request failed'}</strong><span>{error}</span>{error.toLowerCase().includes('database unavailable') && <code>docker compose up -d db</code>}</div>}
    {notice && <div className="history-notice" role="status">{notice}</div>}
    <div className="notice-row history-source-note"><Database size={17} /><div><strong>Historical source</strong><span>Open-Meteo ERA5 reanalysis at representative district coordinates. These are modeled grid-cell estimates, not direct station readings.</span></div></div>
    <section className="history-summary-grid" aria-label="Historical summary">
      <HistoryStat label="Daily records" value={records.length.toLocaleString()} note={`${district} · selected date range`} />
      <HistoryStat label="Mean temperature" value={average(records.map((row) => row.temperature_mean))?.toFixed(1) ?? '—'} unit="°C" note="Daily mean" />
      <HistoryStat label="Total rainfall" value={records.length ? records.reduce((sum, row) => sum + (row.precipitation_sum ?? 0), 0).toFixed(1) : '—'} unit="mm" note="Selected range" />
      <HistoryStat label="Mean humidity" value={average(records.map((row) => row.relative_humidity_mean))?.toFixed(0) ?? '—'} unit="%" note="Daily relative humidity" />
    </section>
    <section className="panel history-chart-panel">
      <div className="panel-heading"><div><p className="card-kicker">MONTHLY TREND</p><h3>{district} · historical series</h3></div><div className="history-segment" role="group" aria-label="Choose historical chart metric">{[['temperature', 'Temperature'], ['rainfall', 'Rainfall'], ['humidity', 'Humidity']].map(([value, label]) => <button key={value} className={metric === value ? 'is-active' : ''} onClick={() => setMetric(value)}>{label}</button>)}</div></div>
      {loading ? <ChartEmpty loading /> : monthly.length ? <div className="chart-wrap history-chart-wrap"><Suspense fallback={<ChartEmpty loading />}><WeatherCharts data={monthly} variant="history" metric={metric} /></Suspense></div> : <div className="history-empty">No records in this range. Sync the archive to populate PostgreSQL.</div>}
      <p className="chart-footnote">Monthly rainfall is summed; temperature and humidity are monthly averages. ERA5 estimates are not station observations.</p>
    </section>
    <section className="history-grid">
      <article className="panel history-table-panel"><div className="panel-heading"><div><p className="card-kicker">YEAR-OVER-YEAR</p><h3>Rainfall and climate</h3></div></div>
        {yearly.length ? <div className="history-table-scroll"><table className="history-table"><thead><tr><th>Year</th><th>Rain</th><th>Mean °C</th><th>Humidity</th></tr></thead><tbody>{yearly.map((item) => <tr key={item.year}><th>{item.year}</th><td>{item.rain.toFixed(1)} mm</td><td>{average(item.temperatures)?.toFixed(1) ?? '—'}</td><td>{average(item.humidity)?.toFixed(0) ?? '—'}%</td></tr>)}</tbody></table></div> : <div className="history-empty">No yearly records loaded.</div>}
      </article>
      <article className="panel history-table-panel"><div className="panel-heading"><div><p className="card-kicker">SEASONAL PATTERNS</p><h3>Tamil Nadu seasons</h3></div></div>
        {seasonal.length ? <div className="history-table-scroll"><table className="history-table"><thead><tr><th>Season</th><th>Rain</th><th>Mean °C</th></tr></thead><tbody>{seasonal.map((item) => <tr key={item.name}><th>{item.name}</th><td>{item.rain.toFixed(1)} mm</td><td>{average(item.temperatures)?.toFixed(1) ?? '—'}</td></tr>)}</tbody></table></div> : <div className="history-empty">Seasonal summaries appear after syncing.</div>}
      </article>
    </section>
    <section className="history-grid">
      <article className="panel history-table-panel"><div className="panel-heading"><div><p className="card-kicker">STATISTICAL FLAGS</p><h3>Potential anomalies</h3></div><span className="data-badge">{anomalies.length}</span></div>
        {anomalies.length ? <div className="history-anomaly-list">{anomalies.slice(0, 8).map((item) => <div className="history-anomaly" key={`${item.date}-${item.label}`}><span className={`anomaly-mark anomaly-mark--${item.tone}`} /><strong>{item.label}</strong><span>{item.date}</span><b>{item.value}</b></div>)}</div> : <div className="history-empty">No statistical outliers found for the available baseline.</div>}
        <p className="chart-footnote">Flags use same-calendar-month historical thresholds; review them as candidates, not official warnings.</p>
      </article>
      <article className="panel history-table-panel"><div className="panel-heading"><div><p className="card-kicker">DISTRICT COMPARISON</p><h3>Across Tamil Nadu</h3></div><span className="data-badge">{comparisonRows.length}/38</span></div>
        {comparisonRows.length ? <div className="history-table-scroll"><table className="history-table"><thead><tr><th>District</th><th>Rain</th><th>Mean °C</th></tr></thead><tbody>{comparisonRows.map((item) => <tr key={item.district}><th>{item.district}</th><td>{item.rainfall_total?.toFixed(1) ?? '—'} mm</td><td>{item.temperature_mean?.toFixed(1) ?? '—'}</td></tr>)}</tbody></table></div> : <div className="history-empty">Sync all districts to compare regional records.</div>}
      </article>
    </section>
    <section className="panel history-ml-panel"><div className="panel-heading"><div><p className="card-kicker">WEATHERGPT ML MODEL · {mlForecast ? `${mlForecast.horizon_days}-DAY LEAD` : 'TRAINING'}</p><h3>Next-day model forecast</h3></div><span className="data-badge">{mlForecast?.target_date ?? '—'}</span></div>
      {mlForecastError ? <div className="history-empty">{mlForecastError}</div> : mlForecast ? <><div className="history-accuracy-metrics"><HistoryStat label="Predicted mean temperature" value={mlForecast.predicted_temperature_mean.toFixed(1)} unit="°C" note={`Target date · ${mlForecast.target_date}`} /><HistoryStat label="Predicted rainfall" value={mlForecast.predicted_precipitation.toFixed(1)} unit="mm" note="ERA5 daily total target" /><HistoryStat label="Temperature holdout MAE" value={mlForecast.temperature_mae_c.toFixed(2)} unit="°C" note={`${mlForecast.validation_samples} chronological test days`} /><HistoryStat label="Rainfall holdout MAE" value={mlForecast.rainfall_mae_mm.toFixed(2)} unit="mm" note={`${mlForecast.training_samples} complete examples`} /></div><p className={`history-model-note${(mlForecast.rainfall_skill_vs_persistence_pct ?? 0) < 0 ? ' history-model-note--caution' : ''}`}>Random Forest · chronological 80/20 holdout · {mlForecast.latest_observation_date} latest input. Skill vs. persistence: temperature {(mlForecast.temperature_skill_vs_persistence_pct ?? 0) >= 0 ? '+' : ''}{mlForecast.temperature_skill_vs_persistence_pct?.toFixed(1) ?? '—'}%, rainfall {(mlForecast.rainfall_skill_vs_persistence_pct ?? 0) >= 0 ? '+' : ''}{mlForecast.rainfall_skill_vs_persistence_pct?.toFixed(1) ?? '—'}%. Negative skill means the ML model performed worse than carrying forward the latest observed value.</p><p className="chart-footnote">ERA5 data is delayed and is not an official live forecast. MAE is an average absolute error, not a percent accuracy score.</p></> : <div className="history-empty">Training the model from stored district records…</div>}
    </section>
    <section className="panel history-accuracy-panel"><div className="panel-heading"><div><p className="card-kicker">OPEN-METEO PROVIDER BENCHMARK · 1-DAY LEAD</p><h3>Provider forecasts vs. reanalysis</h3></div><span className="data-badge">{accuracy?.sample_days ?? 0} DAYS</span></div>
      {accuracyError ? <div className="history-empty">{accuracyError}</div> : accuracy?.sample_days ? <><div className="history-accuracy-metrics"><HistoryStat label="Temperature MAE" value={accuracy.temperature_mae_c?.toFixed(2) ?? '—'} unit="°C" note="Lower is better" /><HistoryStat label="Rainfall MAE" value={accuracy.rainfall_mae_mm?.toFixed(2) ?? '—'} unit="mm" note="Lower is better" /></div><p className="chart-footnote">Forecasts: Open-Meteo Previous Runs API. Reference values: ERA5 reanalysis. This measures the provider, not the WeatherGPT ML model.</p></> : <div className="history-empty">No completed comparison days are available yet.</div>}
    </section>
  </>
}

function HistoryStat({ label, value, unit = '', note }) {
  return <article className="panel history-stat"><span className="metric-label">{label}</span><strong>{value}<small>{unit}</small></strong><span className="metric-caption">{note}</span></article>
}


function UnavailablePage({ icon: Icon, eyebrow, title, message }) {
  return <><PageHeading eyebrow={eyebrow} title={title} description="Reliable data first. This view will update when a verified source is connected." /><section className="empty-state panel"><div className="empty-icon"><Icon size={22} /></div><span className="data-badge data-badge--muted">NOT CONFIGURED</span><h2>No source connected</h2><p>{message}</p></section></>
}

function AboutPage() {
  return <><PageHeading eyebrow="ABOUT WEATHERGPT" title="Weather, with context." description="A regional weather intelligence workspace focused on Tamil Nadu." /><section className="about-grid"><article className="panel about-intro"><div className="about-symbol"><CloudSun size={25} /></div><p className="card-kicker">THE PROJECT</p><h2>Local weather information, clearly sourced.</h2><p>WeatherGPT brings current conditions and third-party forecasts into one district-focused view. Each data point is labelled by source so observations, forecasts, predictions, and official alerts are never confused.</p></article><article className="panel capability-panel"><p className="card-kicker">CURRENT CAPABILITIES</p><div className="capability-row"><span className="capability-dot capability-dot--live" /><div><strong>Live conditions</strong><span>Open-Meteo · 38 district coordinates</span></div><span className="capability-state">Available</span></div><div className="capability-row"><span className="capability-dot capability-dot--live" /><div><strong>Historical archive</strong><span>Open-Meteo ERA5 · PostgreSQL</span></div><span className="capability-state">Available</span></div><div className="capability-row"><span className="capability-dot capability-dot--live" /><div><strong>ML forecast prototype</strong><span>Random Forest · chronological holdout MAE</span></div><span className="capability-state">Experimental</span></div><div className="capability-row"><span className="capability-dot" /><div><strong>Official alerts</strong><span>No verified IMD alert feed connected</span></div><span className="capability-state">Planned</span></div></article></section><div className="notice-row"><Database size={17} /><div><strong>Technical foundation</strong><span>React · FastAPI · Open-Meteo · PostgreSQL · Ollama. The ML forecast is an experimental baseline, not an official forecast.</span></div></div></>
}

function App() {
  return <BrowserRouter><AppShell /></BrowserRouter>
}

export default App
