import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Switch,
    TextInput,
} from 'react-native';
import ItemPayments from './components/itemPayments';

const StatsCard = ({ pending, processed, pendingAmount, collected, progress }) => (
    <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
            <View style={styles.statBox}>
                <Text style={styles.statLabel}>Visitas</Text>
                <Text style={styles.statNumber}>
                    {processed} <Text style={styles.statNumberDivider}>/</Text> {pending}
                </Text>
            </View>
            <View style={styles.statBox}>
                <Text style={styles.statLabel}>Recaudos</Text>
                <Text style={styles.statNumber}>
                    ${collected} <Text style={styles.statNumberDivider}>/</Text> ${pendingAmount}
                </Text>
            </View>
        </View>

        <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}% completado</Text>
        </View>
    </View>
);

const Payments = () => {
    const [showPending, setShowPending] = useState(true);
    const [searchText, setSearchText] = useState('');

    const clients = [
        { name: 'María González', address: 'Calle Principal 123', amount: 250, status: 'PENDIENTE', estadoPago: 'PENDIENTE', paymentType: 'MENSUAL', time: '9:00 AM' },
        { name: 'Juan Pérez', address: 'Av. Libertad 456', amount: 180, status: 'VISITADO', estadoPago: 'pago', paymentType: 'SEMANAL', time: '10:30 AM' },
        { name: 'Ana Martínez', address: 'Plaza Mayor 789', amount: 500, status: 'PENDIENTE', estadoPago: 'PENDIENTE', paymentType: 'QUINCENAL', time: '12:00 PM' },
        { name: 'Carlos Ruiz', address: 'Blvd. Industrial 234', amount: 350, status: 'PENDIENTE', estadoPago: 'PENDIENTE', paymentType: 'MENSUAL', time: '2:30 PM' },
        { name: 'María González', address: 'Calle Principal 123', amount: 250, status: 'PENDIENTE', estadoPago: 'PENDIENTE', paymentType: 'MENSUAL', time: '9:00 AM' },
        { name: 'Juan Pérez', address: 'Av. Libertad 456', amount: 180, status: 'VISITADO', estadoPago: 'noPago', paymentType: 'SEMANAL', time: '10:30 AM' },
        { name: 'Ana Martínez', address: 'Plaza Mayor 789', amount: 500, status: 'VISITADO', estadoPago: 'parcial', paymentType: 'QUINCENAL', time: '12:00 PM' },
        { name: 'Carlos Ruiz', address: 'Blvd. Industrial 234', amount: 350, status: 'PENDIENTE', estadoPago: 'PENDIENTE', paymentType: 'MENSUAL', time: '2:30 PM' },
    ];

    const filteredClients = clients.filter(c =>
        (showPending ? c.status === 'PENDIENTE' : c.status === 'VISITADO') &&
        c.name.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatsCard
                pending={15}
                processed={8}
                pendingAmount={1280}
                collected={750}
                progress={35}
            />

            <View style={styles.listHeader}>
                <Text style={styles.listTitle}>
                    {showPending ? 'Clientes por Visitar' : 'Clientes Tramitados'}
                </Text>
                <Switch
                    value={!showPending}
                    onValueChange={() => setShowPending(!showPending)}
                    thumbColor="#2196F3"
                    trackColor={{ false: '#ccc', true: '#2196F3' }}
                />
            </View>

            <TextInput
                style={styles.searchInput}
                placeholder="Buscar cliente..."
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={setSearchText}
            />

            <ScrollView style={styles.content}>
                {filteredClients.map((client, index) => (
                    <ItemPayments key={index} {...client} />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
    },
    statsContainer: {
        padding: 12,
        backgroundColor: '#fff',
        margin: 10,
        marginBottom: 16,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: '#E0E0E0',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    statNumber: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    statNumberDivider: {
        color: '#999',
    },
    progressContainer: {
        marginTop: 8,
        alignItems: 'center',
    },
    progressBar: {
        width: '100%',
        height: 6,
        backgroundColor: '#E0E0E0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    listTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    searchInput: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        fontSize: 16,
        color: '#333',
    },
});

export default Payments;
