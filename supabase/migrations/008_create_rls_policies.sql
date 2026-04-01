ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stations publiek leesbaar" ON stations
  FOR SELECT USING (true);

CREATE POLICY "Metingen publiek leesbaar" ON measurements
  FOR SELECT USING (true);

CREATE POLICY "Databronnen publiek leesbaar" ON data_sources
  FOR SELECT USING (true);

CREATE POLICY "Stations schrijven via service" ON stations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Metingen schrijven via service" ON measurements
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Sync logs schrijven via service" ON sync_logs
  FOR ALL USING (auth.role() = 'service_role');
