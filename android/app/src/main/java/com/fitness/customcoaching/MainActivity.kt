package com.fitness.customcoaching

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CustomCoachingTheme {
                MainAppScreen()
            }
        }
    }
}

// Premium Color System (Matches Cyberpunk/Glassmorphic Web Style)
val BackgroundDark = Color(0xFF080C14)
val CardDark = Color(0xFF0F172A)
val AccentCyan = Color(0xFF00F2FE)
val AccentPurple = Color(0xFF8B5CF6)
val TextWhite = Color(0xFFF8FAFC)
val TextMuted = Color(0xFF94A3B8)

@Composable
fun CustomCoachingTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = darkColors(
            background = BackgroundDark,
            surface = CardDark,
            primary = AccentCyan,
            secondary = AccentPurple
        ),
        content = content
    )
}

@Composable
fun MainAppScreen() {
    var selectedTab by remember { mutableStateOf(0) }
    
    Scaffold(
        bottomBar = {
            BottomNavigation(
                backgroundColor = CardDark,
                contentColor = TextWhite
            ) {
                BottomNavigationItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Home, contentDescription = "Inicio") },
                    label = { Text("Mi Progreso", fontSize = 11.sp) }
                )
                BottomNavigationItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.Build, contentDescription = "Entrenamiento") },
                    label = { Text("Gimnasio", fontSize = 11.sp) }
                )
                BottomNavigationItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(androidx.compose.material.icons.Icons.Default.ShoppingCart, contentDescription = "Dieta") },
                    label = { Text("Nutrición", fontSize = 11.sp) }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(BackgroundDark)
                .padding(paddingValues)
        ) {
            when (selectedTab) {
                0 -> ProgressDashboardScreen()
                1 -> WorkoutExecutionScreen()
                2 -> NutritionPlanScreen()
            }
        }
    }
}

@Composable
fun ProgressDashboardScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "¡Hola, Brayan!",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = TextWhite
        )
        Text(
            text = "Tu trazabilidad de hoy domingo, 7 de junio",
            fontSize = 14.sp,
            color = TextMuted
        )

        // 1. Water tracker widget
        var waterLogged by remember { mutableStateOf(1250) }
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            backgroundColor = CardDark
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Hidratación Diaria", fontSize = 12.sp, color = TextMuted)
                    Text("$waterLogged ml / 2500 ml", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = AccentCyan)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { waterLogged += 250 },
                        colors = ButtonDefaults.buttonColors(backgroundColor = AccentCyan.copy(alpha = 0.2f))
                    ) {
                        Text("+250 ml", color = AccentCyan, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // 2. Automated Sensor Step Sync Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            backgroundColor = CardDark
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Sensor de Pasos (NEAT)", fontSize = 12.sp, color = TextMuted)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("8,420 pasos", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
                    Button(
                        onClick = { /* Trigger Google Fit Sync */ },
                        colors = ButtonDefaults.buttonColors(backgroundColor = AccentPurple)
                    ) {
                        Text("Sincronizar", color = TextWhite)
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Sincronizado vía Google Health Connect en segundo plano.", fontSize = 11.sp, color = TextMuted)
            }
        }

        // 3. 3D Mannequin Projection Placeholder
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp),
            shape = RoundedCornerShape(16.dp),
            backgroundColor = CardDark
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Color(0xFF04060B), CardDark)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Visualización Física 3D Activa", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextWhite)
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Waist: 80cm | Fat: 11.0% | Bicep: 38cm", fontSize = 12.sp, color = AccentCyan)
                    Spacer(modifier = Modifier.height(15.dp))
                    Text("[ Renderizando Maniquí 3D en Rotación ]", fontSize = 11.sp, color = TextMuted)
                }
            }
        }
    }
}

@Composable
fun WorkoutExecutionScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Día de Entrenamiento", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextWhite)
        Text("Día 1: Fuerza Empuje", fontSize = 16.sp, color = AccentCyan, fontWeight = FontWeight.Medium)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Exercise items
        val exercises = listOf(
            "Flexiones de Pecho" to "4 series x 12-15 reps (RPE 8)",
            "Fondos en Paralelas" to "4 series x 8-10 reps (RPE 8)",
            "Plancha Abdominal" to "3 series x 60 segundos"
        )
        
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            exercises.forEach { (name, details) ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    backgroundColor = CardDark
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(name, fontWeight = FontWeight.Bold, color = TextWhite)
                            Text(details, fontSize = 13.sp, color = TextMuted)
                        }
                        Checkbox(
                            checked = false,
                            onCheckedChange = {},
                            colors = CheckboxDefaults.colors(checkedColor = AccentCyan)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun NutritionPlanScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Plan Nutricional", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextWhite)
        Text("Meta Calórica: 2600 Kcal", fontSize = 16.sp, color = AccentPurple, fontWeight = FontWeight.Medium)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        val meals = listOf(
            "Desayuno" to "Tortilla de claras de huevo con avena y plátano",
            "Almuerzo" to "Pechuga de pollo a la plancha con arroz y ensalada",
            "Merienda" to "Batido de proteína whey con manzana y almendras",
            "Cena" to "Filete de pescado al horno con batata asada"
        )
        
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            meals.forEach { (name, desc) ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    backgroundColor = CardDark
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(name, fontWeight = FontWeight.Bold, color = AccentPurple)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(desc, fontSize = 13.sp, color = TextWhite)
                    }
                }
            }
        }
    }
}
