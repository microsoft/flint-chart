import { useCallback, useState } from 'react';
import election from '../../data/election-2024.json';
import { MapSemanticZoomStage, type MapSelection } from '../MapSemanticZoomStage';
import { ELECTION_DATASET } from '../election-semantic-zoom-input';
import { BespokeFrame } from './application-demos-extensions';

/*
 * The semantic-zoom election map beside a profile. The nation is always
 * listed; a state joins it when the reader flies into one or pans until it
 * sits under the centre, and a county when the reader clicks one. The map
 * reports each of those as a selection, and the host looks the rows up in
 * its own table.
 */

type Tally = { gop: number; dem: number; total: number };
type Profile = { kind: 'Nation' | 'State' | 'County'; name: string; detail: string } & Tally;

const INK = { Harris: '#2f6fb3', Trump: '#c93135' };
const STATES = new Map(election.states.map((row) => [row.state, row]));
const COUNTIES = new Map(election.counties.map((row) => [String(row.fips), row]));
const NATION: Tally = election.states.reduce(
  (sum, row) => ({ gop: sum.gop + row.gop, dem: sum.dem + row.dem, total: sum.total + row.total }),
  { gop: 0, dem: 0, total: 0 },
);

const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const formatCount = (value: number) => value.toLocaleString('en-US');

function ProfileRow({ profile }: { profile: Profile }) {
  const trump = share(profile.gop, profile.total);
  const harris = share(profile.dem, profile.total);
  const margin = trump - harris;
  const leader = margin >= 0 ? 'Trump' : 'Harris';
  return <li className="app-demo-profile">
    <div className="app-demo-profile-head">
      <span className="app-demo-profile-kind">{profile.kind}</span>
      <strong title={profile.detail}>{profile.name}</strong>
    </div>
    <div className="app-demo-tally-bar app-demo-profile-bar" role="img" aria-label={`Harris ${harris.toFixed(1)} percent, Trump ${trump.toFixed(1)} percent`}>
      <span style={{ width: `${harris}%`, background: INK.Harris }} />
      <span style={{ width: `${trump}%`, background: INK.Trump, marginLeft: 'auto' }} />
      <i className="app-demo-tally-line" style={{ left: '50%' }} />
    </div>
    <div className="app-demo-tally-labels">
      <strong style={{ color: INK.Harris }}>{harris.toFixed(1)}%</strong>
      <span style={{ color: INK[leader] }}>{leader} +{Math.abs(margin).toFixed(1)}</span>
      <strong style={{ color: INK.Trump }}>{trump.toFixed(1)}%</strong>
    </div>
  </li>;
}

export function ElectionProfileDemo() {
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [countyFips, setCountyFips] = useState<string | null>(null);

  const onSelect = useCallback((selection: MapSelection) => {
    if (selection.kind === 'home') {
      setStateCode(null);
      setCountyFips(null);
      return;
    }
    if (selection.kind === 'state') {
      setStateCode(selection.key);
      // A county belongs with the state under the centre; leaving the state drops it.
      setCountyFips((current) => (current && COUNTIES.get(current)?.state === selection.key ? current : null));
      return;
    }
    const county = COUNTIES.get(String(selection.key));
    if (!county) return;
    setCountyFips(String(selection.key));
    setStateCode(county.state);
  }, []);

  const state = stateCode ? STATES.get(stateCode) : undefined;
  const county = countyFips ? COUNTIES.get(countyFips) : undefined;
  const profiles: Profile[] = [
    { kind: 'Nation', name: 'United States', detail: `${election.states.length} states and DC`, ...NATION },
    ...(state ? [{ kind: 'State' as const, name: state.stateName, detail: `${state.counties} counties`, gop: state.gop, dem: state.dem, total: state.total }] : []),
    ...(county ? [{ kind: 'County' as const, name: county.county, detail: STATES.get(county.state)?.stateName ?? county.state, gop: county.gop, dem: county.dem, total: county.total }] : []),
  ];

  return <div className="app-demo-map-profile">
    <BespokeFrame><MapSemanticZoomStage dataset={ELECTION_DATASET} onSelect={onSelect} maxScale={1.2} /></BespokeFrame>
    <aside className="app-demo-box app-demo-profile-panel" aria-label="Profile" aria-live="polite">
      <h4 className="app-demo-column-title">Profile</h4>
      <ul className="app-demo-profiles">
        {profiles.map((profile) => <ProfileRow key={profile.kind} profile={profile} />)}
      </ul>
      <p className="it-detail-note app-demo-profile-hint">
        {!state && 'Click a state to add it.'}
        {state && !county && 'Click a county to add it; double-click for home.'}
        {state && county && 'Pan to another state and the county drops.'}
      </p>
    </aside>
  </div>;
}
