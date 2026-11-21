import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

function WeatherTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value)
  return <div className="chart-tooltip"><span>{label}</span><strong>{Number.isInteger(value) ? value : value.toFixed(1)}{unit}</strong></div>
}

export default function WeatherCharts({ data, variant = 'hourly', metric = 'temperature', selectedDistrict = '' }) {
  const isHourly = variant === 'hourly'
  const isTemperature = metric === 'temperature'
  const isHumidity = metric === 'humidity'
  const unit = metric === 'temperature' ? '°C' : isHumidity ? '%' : metric === 'wind_speed' ? ' km/h' : ' mm'

  if (variant === 'comparison') {
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 5, bottom: 4 }}>
      <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
      <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 9 }} unit={unit} />
      <YAxis type="category" dataKey="district" width={102} interval={0} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 9 }} />
      <Tooltip content={<WeatherTooltip unit={unit} />} />
      <Bar dataKey="value" name={metric.replace('_', ' ')} radius={[0, 3, 3, 0]} maxBarSize={13}>{data.map((item) => <Cell key={item.district} fill={item.district === selectedDistrict ? '#f0c77e' : '#78c9f5'} />)}</Bar>
    </BarChart></ResponsiveContainer>
  }

  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
    <defs><linearGradient id={isHourly ? 'temperatureFill' : 'analyticsFill'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#78c9f5" stopOpacity={0.25} /><stop offset="100%" stopColor="#78c9f5" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
    <XAxis dataKey={isHourly ? 'time' : 'date'} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={20} />
    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} unit={unit} />
    <Tooltip content={<WeatherTooltip unit={unit} />} />
    {isHourly ? <Area type="monotone" dataKey="temperature" name="Temperature" stroke="#78c9f5" strokeWidth={2.5} fill="url(#temperatureFill)" activeDot={{ r: 4, fill: '#78c9f5', stroke: 'var(--panel)' }} /> : isTemperature ? <><Area type="monotone" dataKey="high" name="High" stroke="#78c9f5" fill="url(#analyticsFill)" strokeWidth={2} /><Area type="monotone" dataKey="low" name="Low" stroke="#79a8d7" fill="transparent" strokeWidth={2} /></> : isHumidity ? <Area type="monotone" dataKey="humidity" name="Relative humidity" stroke="#78c9f5" fill="url(#analyticsFill)" strokeWidth={2} /> : <Area type="monotone" dataKey="rain" name="Rainfall" stroke="#7de0ce" fill="url(#analyticsFill)" strokeWidth={2} />}
  </AreaChart></ResponsiveContainer>
}
