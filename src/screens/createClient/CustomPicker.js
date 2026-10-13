import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    FlatList,
    StyleSheet,
    TextInput
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';

const CustomPicker = ({ data, selectedValue, onSelect, placeholder, visible, onClose }) => {
    const [searchText, setSearchText] = useState("")
  
    // Filtrar datos basado en la búsqueda
    const filteredData = data.filter((item) => item.valor.toLowerCase().includes(searchText.toLowerCase()))
  
    // Limpiar búsqueda cuando se cierre el modal
    const handleClose = () => {
      setSearchText("")
      onClose()
    }
  
    return (
      <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{placeholder}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Icon name="times" size={24} color="#666" />
              </TouchableOpacity>
            </View>
  
            {/* Agregar buscador */}
            <View style={styles.searchContainer}>
              <Icon name="search" size={16} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={setSearchText}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")} style={styles.clearButton}>
                  <Icon name="times-circle" size={16} color="#666" />
                </TouchableOpacity>
              )}
            </View>
  
            <FlatList
              data={filteredData}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedValue === item.id.toString() && styles.modalItemSelected]}
                  onPress={() => {
                    onSelect(item.id.toString(), item.valor)
                    handleClose()
                  }}
                >
                  <Text
                    style={[styles.modalItemText, selectedValue === item.id.toString() && styles.modalItemTextSelected]}
                  >
                    {item.valor}
                  </Text>
                  {selectedValue === item.id.toString() && <Icon name="check" size={16} color="#2196F3" />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Icon name="search" size={48} color="#ccc" />
                  <Text style={styles.emptyText}>No se encontraron resultados</Text>
                  <Text style={styles.emptySubText}>Intenta con otro término de búsqueda</Text>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    )
  }

const styles = StyleSheet.create({
      modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
      modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, height: "72%", paddingBottom: 16 },
      modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderColor: "#E5E5EA" },
      modalTitle: { fontSize: 17, fontWeight: "700", color: "#1D1D1F" },
      modalItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, marginHorizontal: 8, borderRadius: 12 },
      modalItemSelected: { backgroundColor: "#E8F0FE" },
      modalItemText: { fontSize: 16, color: "#1D1D1F" },
      modalItemTextSelected: { color: "#007AFF", fontWeight: "600" },
      searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#F2F2F7", margin: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E5EA" },
      searchIcon: { marginRight: 8 },
      searchInput: { flex: 1, height: 40, fontSize: 15, color: "#1D1D1F" },
      clearButton: { padding: 4, marginLeft: 8 },
      emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 20 },
      emptyText: { fontSize: 16, color: "#6E6E73", marginTop: 12, fontWeight: "600" },
      emptySubText: { fontSize: 13, color: "#8E8E93", marginTop: 4, textAlign: "center" },
});

export default CustomPicker;