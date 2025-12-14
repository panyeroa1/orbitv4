import { NextRequest, NextResponse } from 'next/server';

// Google Cloud Speech-to-Text API endpoint
const GOOGLE_SPEECH_API = 'https://speech.googleapis.com/v1/speech:recognize';
const GOOGLE_TRANSLATE_API = 'https://translation.googleapis.com/language/translate/v2';

export async function POST(req: NextRequest) {
  try {
    const { audio, languageCode, translateTo } = await req.json();

    if (!audio) {
      return NextResponse.json(
        { error: 'No audio data provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

    if (!apiKey) {
      console.error('GOOGLE_CLOUD_API_KEY not configured');
      return NextResponse.json(
        { error: 'Transcription service not configured' },
        { status: 500 }
      );
    }

    // Call Google Speech-to-Text API
    const speechResponse = await fetch(`${GOOGLE_SPEECH_API}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: languageCode || 'en-US',
          enableAutomaticPunctuation: true,
          model: 'default',
          useEnhanced: true,
        },
        audio: {
          content: audio,
        },
      }),
    });

    if (!speechResponse.ok) {
      const error = await speechResponse.text();
      console.error('Google Speech API error:', error);
      return NextResponse.json(
        { error: 'Speech recognition failed' },
        { status: speechResponse.status }
      );
    }

    const speechData = await speechResponse.json();
    const transcript =
      speechData.results?.[0]?.alternatives?.[0]?.transcript || '';

    // If no transcript, return empty
    if (!transcript) {
      return NextResponse.json({ transcript: '' });
    }

    // Optional translation
    let translatedText: string | undefined;

    if (translateTo && translateTo !== languageCode) {
      try {
        const translateResponse = await fetch(
          `${GOOGLE_TRANSLATE_API}?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: transcript,
              target: translateTo,
              format: 'text',
            }),
          }
        );

        if (translateResponse.ok) {
          const translateData = await translateResponse.json();
          translatedText =
            translateData.data?.translations?.[0]?.translatedText;
        }
      } catch (translateError) {
        console.error('Translation error:', translateError);
        // Continue without translation
      }
    }

    return NextResponse.json({
      transcript,
      translatedText,
      confidence: speechData.results?.[0]?.alternatives?.[0]?.confidence,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
