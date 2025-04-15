import React from 'react';
import { View, Text, Button } from 'react-native';

class HomeScreen extends React.Component {
  render() {
    const { navigation } = this.props;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, marginBottom: 16 }}>Pantalla Home</Text>
        <Button title="Ir a Login" onPress={() => navigation.navigate('Login')} />
      </View>
    );
  }
}

export default HomeScreen; 