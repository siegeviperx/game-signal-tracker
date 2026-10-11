import unittest
from build_snapshot import build_features, asof_epoch


class SnapshotTest(unittest.TestCase):
    def test_no_time_leakage_and_variants_separate(self):
        cutoff=asof_epoch('2026-10-10')
        base={'game_id':1,'mapping_id':7,'source_id':'steam_current_players','metric':'concurrent_players_sampled',
              'collection_status':'observed','match_status':'verified','value':10,
              'observed_at':cutoff-30,'collected_at':cutoff-20}
        later_obs={**base,'value':999,'observed_at':cutoff+1,'collected_at':cutoff+1}
        late_arrival={**base,'value':888,'observed_at':cutoff-50,'collected_at':cutoff+1}
        candidate={**base,'mapping_id':8,'value':100,'match_status':'candidate'}
        features=build_features([base,later_obs,late_arrival,candidate],cutoff)
        self.assertEqual(len(features),1)
        self.assertEqual(features[0]['latest_value'],10)
        self.assertEqual(features[0]['samples_7d'],1)
        self.assertEqual(len(build_features([candidate],cutoff)),0)
        self.assertEqual(len(build_features([candidate],cutoff,allow_candidates=True)),1)


if __name__=='__main__':
    unittest.main()
