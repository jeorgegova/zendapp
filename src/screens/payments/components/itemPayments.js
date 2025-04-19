import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import Modal from 'react-native-modal';
import Icon from 'react-native-vector-icons/FontAwesome';

const getStatusColor = (estadoPago) => {
    switch (estadoPago) {
        case 'pago':
            return '#4CAF50';
        case 'noPago':
            return '#F44336';
        case 'parcial':
            return '#FFC107';
        case 'PENDIENTE':
            return '#fff';
    }
};

const ItemPayments = ({ name, address, amount, status, time, paymentType, estadoPago }) => {
    const [modalParcialVisible, setModalParcialVisible] = useState(false);
    const [modalNoPagoVisible, setModalNoPagoVisible] = useState(false);
    const [valorParcial, setValorParcial] = useState('');

    return (
        <View style={styles.clientItem}>
            <View style={[styles.clientBar, { backgroundColor: getStatusColor(estadoPago) }]} />
            <View style={styles.clientContent}>
                <View style={styles.clientHeader}>
                    <View style={styles.paymentType}>
                        <Text style={styles.typeText}>{paymentType}</Text>
                    </View>
                    <Text style={styles.statusText}>{status}</Text>
                </View>
                <Text style={styles.clientName}>{name}</Text>
                <Text style={styles.addressText}>{address}</Text>
                <View style={styles.clientFooter}>
                    <Text style={styles.amountText}>${amount}</Text>
                    <Text style={styles.timeText}>{time}</Text>
                </View>

                {status === 'PENDIENTE' && (
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.iconButton}>
                            <Icon name="check-circle" size={24} color="#4CAF50" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => setModalNoPagoVisible(true)}
                        >
                            <Icon name="times-circle" size={24} color="#F44336" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => setModalParcialVisible(true)}
                        >
                            <Icon name="adjust" size={24} color="#FFC107" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Modal para pago parcial */}
            <Modal
                isVisible={modalParcialVisible}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                animationInTiming={150}
                animationOutTiming={150}
                backdropOpacity={0.4}
                onBackdropPress={() => setModalParcialVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setModalParcialVisible(false)}
                    >
                        <Icon name="close" size={22} color="#333" />
                    </TouchableOpacity>

                    <Text style={styles.modalTitle}>Pago Parcial</Text>

                    <Text style={styles.modalLabel}>Cliente:</Text>
                    <Text style={styles.modalText}>{name || 'Nombre no disponible'}</Text>

                    <Text style={styles.modalLabel}>Crédito total:</Text>
                    <Text style={styles.modalText}>${amount}</Text>

                    <Text style={styles.modalLabel}>Saldo pendiente:</Text>
                    <Text style={styles.modalText}>${amount - 100}</Text>

                    <Text style={styles.modalLabel}>Valor a pagar:</Text>
                    <TextInput
                        placeholder="Ingrese el valor"
                        keyboardType="numeric"
                        style={styles.input}
                        value={valorParcial}
                        onChangeText={setValorParcial}
                    />

                    <TouchableOpacity style={styles.payButton}>
                        <Text style={styles.payButtonText}>Pagar</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Modal para noPago */}
            <Modal
                isVisible={modalNoPagoVisible}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                animationInTiming={150}
                animationOutTiming={150}
                backdropOpacity={0.5}
                onBackdropPress={() => setModalNoPagoVisible(false)}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>¿Estás seguro de no realizar el pago?</Text>
                    <View style={styles.confirmRow}>
                        <TouchableOpacity
                            style={[styles.confirmButton, { backgroundColor: '#F44336' }]}
                        >
                            <Text style={styles.confirmButtonText}>Sí</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmButton, { backgroundColor: '#4CAF50' }]}
                            onPress={() => setModalNoPagoVisible(false)}
                        >
                            <Text style={styles.confirmButtonText}>No</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    clientItem: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        marginBottom: 8,
        marginHorizontal: 16,
        borderRadius: 8,
        overflow: 'hidden',
    },
    clientBar: {
        width: 4,
    },
    clientContent: {
        flex: 1,
        padding: 12,
    },
    clientHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    paymentType: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    typeText: {
        fontSize: 12,
        color: '#2196F3',
    },
    statusText: {
        fontSize: 12,
        color: '#666',
    },
    clientName: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333',
        marginBottom: 4,
    },
    addressText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    clientFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    amountText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#4CAF50',
    },
    timeText: {
        fontSize: 12,
        color: '#666',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 12,
    },
    iconButton: {
        backgroundColor: '#eee',
        padding: 10,
        borderRadius: 20,
    },
    modalContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        elevation: 5,
        position: 'relative',
    },
    modalContent: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        elevation: 5,
        position: 'relative',
    },
    closeButton: {
        position: 'absolute',
        right: 12,
        top: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalLabel: {
        fontSize: 14,
        color: '#444',
        marginBottom: 8,
    },
    modalText: {
        fontSize: 14,
        color: '#444',
        marginBottom: 12,
    },
    input: {
        height: 40,
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    payButton: {
        backgroundColor: '#2196F3',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 12,
    },
    payButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    confirmRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 16,
    },
    confirmButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
});

export default ItemPayments;
