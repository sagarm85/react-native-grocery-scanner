import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { GroceryScanner, ScanError } from 'react-native-grocery-scanner';
import type { GroceryItem } from 'react-native-grocery-scanner';

const scanner = new GroceryScanner({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
  outputLanguage: 'both',
  confidenceThreshold: 0.99,
  categories: ['dairy', 'grains', 'spices', 'oil', 'pulses', 'snacks', 'other'],
});

export default function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function handlePickImage() {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setLoading(true);
    try {
      const list = await scanner.scan(uri);
      setItems(list.items);
    } catch (e) {
      if (e instanceof ScanError && e.code === 'LOW_CONFIDENCE') {
        Alert.alert(
          'Scan quality too low',
          `Confidence: ${((e.confidence ?? 0) * 100).toFixed(0)}%.\nPlease retake the photo in better lighting.\n\nPartial read:\n${e.rawText ?? ''}`,
        );
      } else if (e instanceof ScanError) {
        Alert.alert('Scan failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Grocery Scanner</Text>
      <Button title="Pick Grocery List Image" onPress={handlePickImage} />
      {loading && <ActivityIndicator style={styles.loader} />}
      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.name}>
              {item.nameDevanagari} / {item.nameEnglish}
            </Text>
            <Text style={styles.detail}>
              {item.quantity} {item.unit} · {item.category}
            </Text>
            <Text style={styles.confidence}>
              {(item.confidence * 100).toFixed(0)}% confident
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  loader: { marginTop: 16 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 18, fontWeight: '600' },
  detail: { fontSize: 14, color: '#555', marginTop: 2 },
  confidence: { fontSize: 12, color: '#999', marginTop: 2 },
});
