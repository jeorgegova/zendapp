import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, SafeAreaView, Alert, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { getData, getDbConnection } from '../../database/db';
import CustomPicker from './CustomPicker';
import { apple } from '../../theme/appleTheme';
import { AppleButton } from '../../components/AppleButton';

const CrearCliente = () => {
  const navigation = useNavigation();
  const fade = useRef(new Animated.Value(0)).current;
  let db;
  const [formData, setFormData] = useState({ nombre: '', apellido: '', alias: '', direccion: '', telefono: '', genero: '', documento: '', valor: '', plazo: '', interes: '' });
  const [formDataLabels, setFormDataLabels] = useState({ plazo: '', interes: '' });
  const [isFormValid, setIsFormValid] = useState(false);
  const [conceptosInteres, setConceptosInteres] = useState([]);
  const [conceptosPlazo, setConceptosPlazo] = useState([]);
  const [showPlazoModal, setShowPlazoModal] = useState(false);
  const [showInteresModal, setShowInteresModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    LoadData();
  }, []);

  useEffect(() => {
    const isValid = Object.values(formData).every(v => v.trim() !== '');
    setIsFormValid(isValid);
  }, [formData]);

  const LoadData = async () => {
    try {
      db = await getDbConnection();
      const conceptosData = await getData(db, 'select * from concepts');
      setConceptosInteres(conceptosData.filter(c => c.tipo === 'interes'));
      setConceptosPlazo(conceptosData.filter(c => c.tipo === 'plazo'));
    } catch (e) { console.error(e); }
  };

  const handleChange = (name, value) => setFormData(p => ({ ...p, [name]: value }));
  const handlePickerSelect = (name, value, label) => { setFormData(p => ({ ...p, [name]: value })); setFormDataLabels(p => ({ ...p, [name]: label })); };
  const handleGeneroChange = g => setFormData(p => ({ ...p, genero: g }));

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSaving(true);
    try {
      db = db || await getDbConnection();
      const parametrizacion = await getData(db, 'select valor from parametrizacion');
      const { nombre, apellido, alias, telefono, direccion, documento, valor, plazo, interes } = formData;
      const response = await fetch('https://gwpwntdwogxzmtegaaom.supabase.co/functions/v1/create_sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${parametrizacion[1].valor}` },
        body: JSON.stringify({ nombre, apellido, alias, email: '', telefono, direccion, documento, monto: parseFloat(valor), vendedor_id: parametrizacion[4].valor, caja_id: 'fb752968-9a6a-46cb-bcd6-83c3d4f82e1c', plazo_id: parseInt(plazo), interes_id: parseInt(interes) })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error desconocido');
      Alert.alert('Éxito', `Factura creada: ${result.id_factura}`);
      setFormData({ nombre: '', apellido: '', alias: '', direccion: '', telefono: '', genero: '', documento: '', valor: '', plazo: '', interes: '' });
      setFormDataLabels({ plazo: '', interes: '' });
    } catch (err) { Alert.alert('Error', err.message); } finally { setSaving(false); }
  };

  const Field = ({ label, value, field, placeholder, keyboardType, icon }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon && <Icon name={icon} size={14} color={apple.colors.tertiaryLabel} style={{ marginRight: 8 }} />}
        <TextInput value={value} onChangeText={t => handleChange(field, t)} placeholder={placeholder} placeholderTextColor={apple.colors.tertiaryLabel} style={styles.input} keyboardType={keyboardType} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.headerBtn}>
          <Icon name="chevron-left" size={16} color={apple.colors.blue} />
          <Text style={styles.headerBack}>Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva Venta</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.pageTitle}>Crear cliente y crédito</Text>
            <Text style={styles.pageSub}>Completa los datos. El cliente y la factura se crean transaccionalmente.</Text>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#E8F0FE' }]}><Icon name="user" size={14} color={apple.colors.blue} /></View><Text style={styles.sectionTitle}>Información personal</Text></View>
              <Field label="Nombre *" value={formData.nombre} field="nombre" placeholder="Ej. Carlos" icon="user" />
              <Field label="Apellido *" value={formData.apellido} field="apellido" placeholder="Ej. Ramírez" icon="user-o" />
              <Field label="Alias *" value={formData.alias} field="alias" placeholder="Ej. carlosr" icon="star-o" />
              <Text style={styles.fieldLabel}>Género *</Text>
              <View style={styles.segment}>
                {['masculino', 'femenino'].map(g => (
                  <TouchableOpacity key={g} onPress={() => handleGeneroChange(g)} style={[styles.segmentOpt, formData.genero === g && styles.segmentOptActive]}>
                    <Text style={[styles.segmentText, formData.genero === g && styles.segmentTextActive]}>{g === 'masculino' ? 'Masculino' : 'Femenino'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#E8F5E9' }]}><Icon name="map-marker" size={14} color={apple.colors.success} /></View><Text style={styles.sectionTitle}>Contacto</Text></View>
              <Field label="Dirección *" value={formData.direccion} field="direccion" placeholder="Calle 123 #45-67" icon="home" />
              <Field label="Teléfono *" value={formData.telefono} field="telefono" placeholder="311 234 5678" keyboardType="phone-pad" icon="phone" />
              <Field label="Documento *" value={formData.documento} field="documento" placeholder="CC / NIT" keyboardType="numeric" icon="id-card" />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#FFF3E0' }]}><Icon name="money" size={14} color={apple.colors.warning} /></View><Text style={styles.sectionTitle}>Venta</Text></View>
              <Field label="Valor *" value={formData.valor} field="valor" placeholder="0.00" keyboardType="numeric" icon="dollar" />
              <Text style={styles.fieldLabel}>Plazo *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowPlazoModal(true)}>
                <Text style={[styles.pickerText, !formDataLabels.plazo && { color: apple.colors.tertiaryLabel }]}>{formDataLabels.plazo || 'Selecciona plazo'}</Text>
                <Icon name="chevron-down" size={12} color={apple.colors.tertiaryLabel} />
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Interés *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowInteresModal(true)}>
                <Text style={[styles.pickerText, !formDataLabels.interes && { color: apple.colors.tertiaryLabel }]}>{formDataLabels.interes || 'Selecciona interés'}</Text>
                <Icon name="chevron-down" size={12} color={apple.colors.tertiaryLabel} />
              </TouchableOpacity>
            </View>

            <AppleButton title={saving ? 'Guardando...' : 'Guardar venta'} onPress={handleSubmit} loading={saving} disabled={!isFormValid || saving} style={{ marginTop: 8 }} />
            {!isFormValid && <Text style={styles.hint}>Completa todos los campos para habilitar el guardado.</Text>}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomPicker data={conceptosPlazo} selectedValue={formData.plazo} onSelect={(v, l) => handlePickerSelect('plazo', v, l)} placeholder="Seleccionar Plazo" visible={showPlazoModal} onClose={() => setShowPlazoModal(false)} />
      <CustomPicker data={conceptosInteres} selectedValue={formData.interes} onSelect={(v, l) => handlePickerSelect('interes', v, l)} placeholder="Seleccionar Interés" visible={showInteresModal} onClose={() => setShowInteresModal(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: apple.colors.bgGrouped },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: apple.colors.card, borderBottomWidth: 0.5, borderColor: apple.colors.separator },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBack: { color: apple.colors.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: apple.colors.label },
  pageTitle: { ...apple.typography.title2, marginTop: 4 },
  pageSub: { ...apple.typography.subheadline, marginTop: 4, marginBottom: 16 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 16,
    padding: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...apple.typography.headline },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: apple.colors.secondaryLabel, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 12, height: 46 },
  input: { flex: 1, fontSize: 16, color: apple.colors.label },
  segment: { flexDirection: 'row', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, padding: 3, gap: 4 },
  segmentOpt: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentOptActive: { backgroundColor: apple.colors.card },
  segmentText: { fontSize: 14, fontWeight: '500', color: apple.colors.secondaryLabel },
  segmentTextActive: { color: apple.colors.label, fontWeight: '600' },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 12, height: 46, marginBottom: 12 },
  pickerText: { fontSize: 16, color: apple.colors.label },
  hint: { ...apple.typography.caption1, textAlign: 'center', marginTop: 8 },
});

export default CrearCliente;
