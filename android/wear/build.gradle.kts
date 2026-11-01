plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "ru.vitalvoi.cdmm.wear"
    compileSdk = 37
    defaultConfig {
        // Same id as the phone app, as Wear OS expects of a companion.
        applicationId = "ru.vitalvoi.cdmm"
        minSdk = 30
        targetSdk = 36
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1"
    }
    signingConfigs {
        System.getenv("CDMM_KEYSTORE")?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = System.getenv("CDMM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CDMM_KEY_ALIAS") ?: "cdmm"
                keyPassword = System.getenv("CDMM_KEY_PASSWORD") ?: System.getenv("CDMM_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.activity.compose)
    implementation(libs.compose.ui)
    implementation(libs.wear.compose.material3)
    implementation(libs.wear.compose.foundation)
    implementation(libs.wear.tiles)
    implementation(libs.wear.protolayout)
    implementation(libs.wear.protolayout.expression)
    implementation(libs.wear.complications)
    implementation(libs.concurrent.futures)
    implementation(libs.guava.listenablefuture)
}
